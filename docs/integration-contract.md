# Integration contract

## Minimum read-only input

Guard consumes either a bare TaskContractLite or a provider document with `envelope` and `projection`.

The projection is exactly the seven TaskContractLite fields: `objective`, `primary_object`, `delivery_surface`, `scope`, `must_and_must_not`, `authorization`, and `completion_evidence`. Extra fields fail validation.

A provider envelope contains:

- `schema_version`: currently `1.0`; unknown versions fail closed to unbound/advisory behavior.
- `contract_ref`: stable opaque identity owned by the intent provider.
- `contract_version`: positive integer; every material intent correction or replacement creates a new version.
- `source`: `user-intent-plugin`.
- `source_message_refs`: bounded opaque references, never the full transcript.
- `snapshot_sha256`: SHA-256 of the canonical projection; mismatch invalidates the binding.
- `updated_at`: provider timestamp.

For a bare fallback contract, Guard derives `lite:<sha-prefix>`, sets version 1, and never writes that identity upstream.

## Writeback

Guard never writes to Intent Loop, Continuity, or the Host's canonical task state. A Harness-native one-call approval authorizes that exact execution in the Host; it does not rewrite the contract. Contract changes must come from the canonical intent owner as a new version.

Guard-owned receipts remain in a bounded in-memory buffer for the active plugin process. Disk receipt persistence is disabled in this alpha, and a non-empty legacy `receiptPath` is rejected. Receipt records contain tool name, action tags, decision metadata, and argument/result hashes; they do not contain raw arguments or transcript text.

`authorization.allowed` is a positive-match record, not a closed allowlist. Unlisted actions continue unless `forbidden`, `requires_user`, or `must_not` matches. The contract owner must put every boundary that needs a stop or approval into one of those three buckets.

## Final state ownership

| Owner | State |
|---|---|
| Intent Loop | Canonical current intent, preferences, corrections, and contract version |
| Continuity | Current phase, unresolved commitments, recovery references, and evidence references |
| Execution Fidelity Guard | Decisions, bounded receipt/evidence records, and the per-turn continuation-attempt budget |
| DeepSeek Harness Host | Tool execution, sandbox/permission result, one-call approval, session lifecycle, and final user interaction |

The Guard does not copy full intent state, own the plan, approve on behalf of the user, or claim it can reverse a completed side effect.
