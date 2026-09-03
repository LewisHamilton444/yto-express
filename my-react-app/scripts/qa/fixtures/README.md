# qa:layout fixtures

Drop **real MongoDB exports** here as JSON files to make the layout sweep run
against genuine record shapes and volumes instead of the synthetic generator
in `scripts/qa/seedServer.mjs`.

## How it works

On every `npm run qa:layout` boot, `seedServer.mjs` scans this folder. Each
`<name>.json` present **replaces the synthetic payload for one API route**;
routes without a fixture keep their synthetic data. The folder may be empty
or absent — the sweep always works.

## File name → API route table

| File | Route | Expected shape |
|---|---|---|
| `parcels.json` | `GET /api/parcels` | array |
| `riders.json` | `GET /api/riders` | array |
| `sellers.json` | `GET /api/sellers` | array |
| `accounts.json` | `GET /api/accounts` | array |
| `customers.json` | `GET /api/customers` | array |
| `issues.json` | `GET /api/issues` | array |
| `parcel-locations.json` | `GET /api/parcel-locations` | array |
| `notifications.json` | `GET /api/notifications` | array |
| `activity-log.json` | `GET /api/activity-log` | array |
| `events-alerts.json` | `GET /api/events/alerts` | array |
| `events-history.json` | `GET /api/events/history` | array |
| `dashboard-stats.json` | `GET /api/dashboard/stats` | **object** |
| `events-stats.json` | `GET /api/events/stats` | **object** |

A file with the wrong shape (array where an object is required, or an
unparseable JSON file) is skipped with a warning and the synthetic fallback
is used for that route.

## Exporting from MongoDB Atlas

```bash
# one collection -> one JSON array file
mongosh "mongodb+srv://USER:PASS@cluster/DB" \
  --quiet --eval 'JSON.stringify(db.parcels.find().toArray())' > parcels.json
```

Then run:

```bash
npm run qa:layout
```

The boot log prints which fixtures were loaded, e.g.:

```
[seed] fixture parcels.json -> /parcels (184 rows)
```

## Note on privacy

These files are committed to the repo. Export **sanitized** collections
(mask phone numbers / emails / full names / addresses / coordinates) if the
database contains production customer data — the sweep only needs realistic
shapes, lengths, and volumes, not real identities.
