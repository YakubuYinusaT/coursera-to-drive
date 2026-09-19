# coursera-to-drive

Downloads enrolled Coursera courses on GitHub Actions and uploads them to Google Drive. Uses [coursera-helper](https://github.com/csyezheng/coursera-helper) and [rclone](https://rclone.org).

## One-time setup

Add two repository secrets (Settings > Secrets and variables > Actions):

| Secret | Value |
|---|---|
| `COURSERA_CAUTH` | The `CAUTH` cookie from coursera.org (F12 > Application > Cookies) |
| `GDRIVE_TOKEN` | The JSON token printed by `rclone authorize "drive"` |

## Use

Actions > Coursera to Google Drive > Run workflow.

1. Run with **list-courses** to see your course slugs.
2. Run with **download** and paste slugs separated by spaces.

Each course runs as its own job (6 hour limit each, 2 at a time). Files land in `My Drive/Coursera/<course>/`. Whatever finished is uploaded even if a job fails, and rerunning skips files already in Drive.

If a run fails with 403, the CAUTH cookie expired. Update the secret.

`coursera_to_drive.ipynb` is the Google Colab version of the same thing.
