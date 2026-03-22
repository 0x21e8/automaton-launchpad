# Factory Stable Storage

The factory now uses `ic-stable-structures` as its canonical storage model.

## Layout

- `MemoryId 0`: storage metadata cell
- `MemoryId 1`: singleton factory config/runtime cell
- `MemoryId 2`: `sessions`
- `MemoryId 3`: `escrow_claims`
- `MemoryId 4`: `registry`
- `MemoryId 5`: `runtimes`
- `MemoryId 6`: `audit_log`

Schema version `1` is stored in the metadata cell alongside the audit layout choice.

## Audit Storage

Audit entries are stored as a session-keyed stable collection. Each session ID maps to its ordered audit entry list.

## Upgrade Model

Stable structures are the source of truth. `pre_upgrade` no longer writes a monolithic `stable_save` snapshot, and `post_upgrade` reopens the stable layout directly.

## Rollback Constraint

Rollback to binaries that expect the old snapshot-only stable memory format is unsupported. The stable memory root is now owned by the memory manager and per-collection stable structures.

That constraint is acceptable for this project state because the factory has not been deployed yet. If deployed state ever needs rollback across storage formats, a dedicated export/import path will be required.
