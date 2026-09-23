function normalizeStatementTimeout(statementTimeoutMs) {
  const value = Number(statementTimeoutMs);
  if (!Number.isFinite(value) || value < 1000 || value > 120000) {
    throw new Error('statementTimeoutMs must be between 1000 and 120000.');
  }
  return Math.trunc(value);
}

export async function withAiosReadOnlyTransaction(
  client,
  { statementTimeoutMs = 15000 } = {},
  callback,
) {
  if (!client?.query) throw new Error('A PostgreSQL client with query() is required.');
  if (typeof callback !== 'function') throw new Error('A read-only audit callback is required.');

  const timeoutMs = normalizeStatementTimeout(statementTimeoutMs);
  let primaryError;
  let result;
  let rollbackError;
  let transactionStarted = false;

  try {
    await client.query('BEGIN READ ONLY');
    transactionStarted = true;
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
    result = await callback();
  } catch (error) {
    primaryError = error;
  } finally {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        rollbackError = error;
      }
    }
  }

  if (primaryError) throw primaryError;
  if (rollbackError) throw rollbackError;
  return result;
}
