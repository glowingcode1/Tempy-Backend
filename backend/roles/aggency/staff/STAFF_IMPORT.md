# Staff CSV import

Bulk-adds staff to an agency / home care company from a CSV file. Every row is
processed on its own, so one bad row never blocks the rest of the file.

## Endpoints

| Method | Path                    | Purpose                                  |
| ------ | ----------------------- | ---------------------------------------- |
| `GET`  | `/staff/import/template` | Downloads the sample CSV                 |
| `POST` | `/staff/import`          | Uploads a CSV (`multipart/form-data`, field name `file`) |

Both require a bearer token for `admin`, `agency` or `homeCareCompany`. When the
caller is an `admin`, the target employer must be passed as `userId` in the body.

Uploads are limited to 5 MB and must be `.csv`.

## What happens per row

The email address decides the outcome:

| Situation                                             | Action                                                   | Reported as |
| ----------------------------------------------------- | -------------------------------------------------------- | ----------- |
| Email is registered, but not staff of this employer   | A staff request is created (`status: pending`) and the nurse is notified by push/in-app and email | `invited`   |
| Email is registered and already staff of this employer | Nothing happens — the staff member is not added twice     | `skipped`   |
| Email is not registered                               | The new nurse creation flow runs, then a staff request is created | `created`   |
| Row is unusable (validation, unknown branch, non-nurse account) | Nothing is written                              | `failed`    |

A staff record that was previously `left` or `deleted` is treated as "not staff
any more", so a fresh request is sent and it is reported as `invited` — this
mirrors what the single `POST /staff` endpoint already does.

Only nurse accounts can be added as staff. If the email belongs to a care home,
agency or any other account type, the row fails.

## Columns

Headers are matched case-insensitively and ignore spaces/underscores, so
`Full Name`, `full_name` and `fullName` are all accepted.

| Column            | Required            | Notes                                                        |
| ----------------- | ------------------- | ------------------------------------------------------------ |
| `name`            | yes                 | Also aliased as `fullName`, `staffName`, `nurseName`          |
| `email`           | yes                 | Decides which of the three flows runs                         |
| `branch`          | yes                 | Branch **name** or branch id; must belong to this employer     |
| `speciality`      | yes                 | One or more of `generalNurse`, `mentalHealth`, `elderlyCare`, `learningDisability`, `pediatric`, `healthcareAssistant`, `supportWorker`. Separate with `;` |
| `ratePerHour`     | yes                 | Number greater than 0                                         |
| `taxNumber`       | for new accounts    | Required by the nurse model; only needed when the email is not registered yet |
| `platformPercent` | no (default `0`)    | 0–100                                                         |
| `phoneCode`       | no                  | Include the `+`, e.g. `+44`. Must be paired with `phoneNumber` |
| `phoneNumber`     | no                  | Digits only; `phoneCode` + `phoneNumber` must be valid E.164   |
| `dob`             | no                  | `YYYY-MM-DD`                                                  |
| `gender`          | no                  | `Male`, `Female` or `Other` (case-insensitive)                |
| `password`        | no                  | Only used for new accounts. Left blank, a random one is generated and the invite asks the nurse to set their own via "Forgot password" |
| `fullAddress`, `city`, `state`, `country`, `postalCode` | no | Stored as the staff location            |
| `latitude`, `longitude` | no            | Both required together to store coordinates                   |
| `governmentIdentity`, `degree`, `certification` | no | Document paths, `;` separated                    |

Fields containing a comma must be quoted, e.g. `"44 Kings Road, Chelsea"`.

## Response

`201` when every row was applied, `207` when some rows were skipped or failed.

```json
{
  "message": "Staff CSV import completed",
  "data": {
    "summary": { "total": 3, "invited": 1, "created": 1, "skipped": 1, "failed": 0 },
    "results": [
      {
        "row": 2,
        "email": "alice.morgan@example.com",
        "name": "Alice Morgan",
        "branch": "London Central",
        "action": "invited",
        "staffId": "…",
        "message": "staff request sent"
      }
    ]
  }
}
```

`row` is the spreadsheet row number (the header is row 1), so a failed row can be
pointed at directly in the uploaded file.

## Sample file

`backend/assets/samples/staff-import-sample.csv`, also served by
`GET /staff/import/template`.
