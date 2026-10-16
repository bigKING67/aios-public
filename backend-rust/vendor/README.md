# Temporary XLSX dependency compatibility patches

These are source copies of the released calamine 0.36.1 and rust_xlsxwriter 0.99.1 crates, authenticated against the crates.io archive SHA-256 values in each AIOS-PATCH.json. They preserve upstream licenses, complete library source, feature definitions, original manifests, README and compile-time changelogs. Unused upstream example/benchmark targets and their assets are omitted.

Both libraries currently require the withdrawn ZIP 8 series. Their manifests pin supported ZIP 9.0.3. The only library source change is calamine src/utils.rs: consume successful entries from the now-fallible file_names iterator, equivalent to the adaptation in https://github.com/tafia/calamine/pull/741. The application still uses its existing APIs, enabled features and XLSX limits. These are local compatibility patches, not new upstream releases; Cargo.lock intentionally records path sources.

The copies live inside the Rust Docker build context and are included in the complete backend Git tree fingerprint used to prove image/source parity. They must remain in source exports with their licenses so exported builds are reproducible. The repository's dependency audit remains unchanged and checks ZIP 9.0.3 normally.

Validation: existing AIOS sample/inbound template round trips, published headers, outbound export field parity, malformed workbook rejection and creator-library XLSX parsing, followed by the backend and release gates. Keep validation results in the release task/receipt.

Removal: when official releases of both libraries support a non-yanked ZIP version and pass the same regressions, remove the corresponding patch entries and source copies, update Cargo.lock, and remove Docker COPY vendor once no patches remain. Do not add unrelated library changes to these copies.
