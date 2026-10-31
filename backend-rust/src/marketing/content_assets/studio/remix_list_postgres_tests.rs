//! 成片 list paging against a disposable database: keyset pages, the outputs filter and
//! per-type counts over the whole scope.
use super::postgres_tests::{pool, user, SCOPED};
use super::remix;
use super::remix_list;
use super::remix_postgres_tests::{create_request, fixture, settings};
use super::remix_types::RemixBatchListQuery;
use std::collections::HashSet;

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn list_pages_newest_first_filters_outputs_and_counts_the_whole_scope() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let mut created = Vec::new();
    for key in ["page-a", "page-b", "page-c"] {
        let detail = remix::create(
            &pool,
            &settings(),
            &owner,
            SCOPED,
            &create_request(&f, 1, key),
        )
        .await
        .unwrap();
        created.push(detail.batch.batch_id);
    }
    // The oldest batch is cancelled: no output left to watch.
    sqlx::query(
        "UPDATE ads.content_production_runs SET status = 'cancelled' WHERE run_id IN \
         (SELECT run_id FROM ads.content_remix_batch_runs WHERE batch_id = $1)",
    )
    .bind(created[0])
    .execute(&pool)
    .await
    .unwrap();
    let list = |query: RemixBatchListQuery| {
        let pool = pool.clone();
        let owner = f.owner.clone();
        async move { remix_list::list(&pool, &settings(), &owner, Some(&owner), None, &query).await }
    };

    // Two pages of two, newest first, no overlap, and no cursor after the last.
    let first = list(RemixBatchListQuery {
        limit: Some(2),
        ..Default::default()
    })
    .await
    .unwrap();
    assert_eq!(
        first.items.iter().map(|b| b.batch_id).collect::<Vec<_>>(),
        vec![created[2], created[1]]
    );
    let cursor = first.next_cursor.clone().expect("a third batch follows");
    let second = list(RemixBatchListQuery {
        limit: Some(2),
        cursor: Some(cursor),
        ..Default::default()
    })
    .await
    .unwrap();
    assert_eq!(
        second.items.iter().map(|b| b.batch_id).collect::<Vec<_>>(),
        vec![created[0]]
    );
    assert!(second.next_cursor.is_none());
    let seen: HashSet<_> = first
        .items
        .iter()
        .chain(&second.items)
        .map(|b| b.batch_id)
        .collect();
    assert_eq!(seen.len(), 3);

    // Numbered pages land on the same rows as the keyset pages.
    let numbered = list(RemixBatchListQuery {
        limit: Some(2),
        page: Some(2),
        ..Default::default()
    })
    .await
    .unwrap();
    assert_eq!(
        numbered
            .items
            .iter()
            .map(|b| b.batch_id)
            .collect::<Vec<_>>(),
        vec![created[0]]
    );
    assert!(numbered.next_cursor.is_none());

    // Counts cover the whole scope on every page.
    for page in [&first, &second] {
        assert_eq!(
            (
                page.counts.with_outputs.all,
                page.counts.with_outputs.framework
            ),
            (2, 2)
        );
        assert_eq!(
            (
                page.counts.without_outputs.all,
                page.counts.without_outputs.framework
            ),
            (1, 1)
        );
        assert_eq!(
            page.counts.with_outputs.selling_point + page.counts.with_outputs.edit,
            0
        );
    }

    // The outputs and type filters run in SQL.
    let without = list(RemixBatchListQuery {
        outputs: Some("without".into()),
        ..Default::default()
    })
    .await
    .unwrap();
    assert_eq!(
        without.items.iter().map(|b| b.batch_id).collect::<Vec<_>>(),
        vec![created[0]]
    );
    let with = list(RemixBatchListQuery {
        outputs: Some("with".into()),
        ..Default::default()
    })
    .await
    .unwrap();
    assert_eq!(with.items.len(), 2);
    let edits = list(RemixBatchListQuery {
        mode: Some("edit".into()),
        ..Default::default()
    })
    .await
    .unwrap();
    assert!(edits.items.is_empty());

    // Bad parameters are rejected before any query.
    for query in [
        RemixBatchListQuery {
            mode: Some("remix".into()),
            ..Default::default()
        },
        RemixBatchListQuery {
            outputs: Some("all".into()),
            ..Default::default()
        },
        RemixBatchListQuery {
            limit: Some(0),
            ..Default::default()
        },
        RemixBatchListQuery {
            limit: Some(101),
            ..Default::default()
        },
        RemixBatchListQuery {
            cursor: Some("garbage".into()),
            ..Default::default()
        },
        RemixBatchListQuery {
            page: Some(0),
            ..Default::default()
        },
    ] {
        assert!(list(query).await.is_err());
    }
}
