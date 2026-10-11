# Failed Delivery Attempt API (for the rider app)

Call this when a rider cannot deliver a parcel. The web server saves the attempt, updates the parcel status, and alerts the admin panel immediately.

## Endpoint

```
POST {BASE_URL}/api/parcels/{trackingNumber}/failed-attempt
```

| Environment | BASE_URL |
|---|---|
| Live | `https://yto-express-backend.onrender.com` |
| Local | `http://localhost:3001` |

`{trackingNumber}` is the parcel's tracking number, for example `YTO123456789`.

## Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-bridge-api-key` | The shared bridge key (`BRIDGE_API_KEY`). This is the same key the GPS ping route uses. Get it from the web team; never commit it to the app's code. |

## Body

| Field | Type | Required | Rules |
|---|---|---|---|
| `riderId` | string | yes | The rider's registration ID, for example `YTOR20260001`. Max 60 characters. |
| `reason` | string | yes | Must be **exactly** one of the reasons listed below. |
| `notes` | string | no | Free text from the rider. Max 500 characters. |
| `lat` | number | no | Latitude, from -90 to 90. Send it together with `lng`. |
| `lng` | number | no | Longitude, from -180 to 180. Send it together with `lat`. |
| `photoUrl` | string | no | A link to the photo, starting with `http://` or `https://`. Upload the photo first, then send its link. |
| `timestamp` | string | no | ISO date of the attempt, for example `2026-10-11T09:30:00Z`. The server uses its own time if this is missing. |

### Allowed `reason` values

```
Recipient not available
Recipient refused
Wrong or incomplete address
Recipient unreachable
Recipient requested reschedule
No cash for COD
Unsafe area or bad weather
Other
```

## Rules

- A parcel gets at most **3** failed attempts.
- An attempt is accepted only while the parcel is **`Out for Delivery`** or **`Failed Attempt`**. The rider can try again the next day without waiting for the office.
- Attempts 1 and 2 set the status to **`Failed Attempt`**.
- Attempt 3 sets the status to **`Returned to Hub`**. The rider should bring the parcel back to the hub.
- A 4th attempt is refused with a 400 error.

The full status flow:

```
Out for Delivery → Failed Attempt → (Failed Attempt) → Returned to Hub        ← rider app
Returned to Hub → Received at Hub (Returned)                                  ← hub staff
Received at Hub (Returned) → Returned to Seller                               ← office
Failed Attempt / Returned to Hub / Received at Hub (Returned)
   → Out for Delivery (only while attempts < 3)                               ← office "Re-deliver"
```

The web server also pushes these new statuses to the mobile backend with the existing `POST /api/bridge/receive-status` call: **`Failed Attempt`**, **`Returned to Hub`**, **`Received at Hub (Returned)`** and **`Returned to Seller`**. Please add them to the mobile backend's allowed status list, otherwise it will refuse those updates.

## Example

Request:

```http
POST /api/parcels/YTO123456789/failed-attempt
Content-Type: application/json
x-bridge-api-key: <bridge key>

{
  "riderId": "YTOR20260001",
  "reason": "Recipient not available",
  "notes": "Gate locked, called twice",
  "lat": 14.8995,
  "lng": 120.8490,
  "photoUrl": "https://example.com/photos/attempt1.jpg",
  "timestamp": "2026-10-11T09:30:00Z"
}
```

Response `201 Created` (attempt 1 or 2):

```json
{
  "message": "Attempt 1 of 3 recorded.",
  "trackingNumber": "YTO123456789",
  "status": "Failed Attempt",
  "attemptNumber": 1,
  "attemptsLeft": 2,
  "maxAttempts": 3
}
```

Response `201 Created` (attempt 3):

```json
{
  "message": "Attempt 3 of 3 recorded. The parcel is now going back to the hub.",
  "trackingNumber": "YTO123456789",
  "status": "Returned to Hub",
  "attemptNumber": 3,
  "attemptsLeft": 0,
  "maxAttempts": 3
}
```

## Errors

Every error has the shape `{ "error": "<message>" }`.

| Status | When | Example `error` |
|---|---|---|
| 400 | `riderId` missing or too long | `"riderId" is required (up to 60 characters).` |
| 400 | `reason` not in the list | `"reason" must be one of: Recipient not available, ...` |
| 400 | `notes` not text, or over 500 characters | `"notes" can be at most 500 characters.` |
| 400 | `lat`/`lng` invalid, or only one of them sent | `"lat" and "lng" must be sent together as valid numbers.` |
| 400 | `photoUrl` is not an http(s) link | `"photoUrl" must be a web link starting with http:// or https://.` |
| 400 | `timestamp` is not a date | `"timestamp" must be a valid date (for example 2026-10-11T09:30:00Z).` |
| 400 | Parcel already has 3 attempts | `This parcel already has 3 failed delivery attempts. No more attempts can be recorded.` |
| 400 | Parcel is not out for delivery | `This parcel is "Delivered". A failed attempt can only be recorded while it is Out for Delivery or after an earlier failed attempt.` |
| 401 | Missing or wrong `x-bridge-api-key` | `Missing or invalid bridge API key.` |
| 404 | No parcel with that tracking number | `That parcel could not be found.` |
| 409 | Two reports for the same parcel arrived at the same moment | `This parcel was just updated. Please try again.` |
| 500 | Server problem | `Something went wrong on our side. Please try again.` (includes a `ref` code for the web team) |
| 503 | The server has no bridge key set | `Bridge API key not configured.` |

On a 400 error, show the message to the rider and don't retry automatically. Only 409, 500 or a network error is worth retrying.
