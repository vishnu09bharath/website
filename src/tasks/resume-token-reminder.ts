import { sendEmail } from "../lib/email";
import type { Task } from "./types";

// The fine-grained GitHub token (WEBSITE_PUSH_TOKEN in the resume repo) that
// lets the résumé sync workflow push to this repo. After renewing it, update
// EXPIRES, the schedule, and the year in the id (a new id = a fresh one-off run).
const EXPIRES = "September 13, 2027";

export default {
  id: "resume-token-reminder-2027",
  title: "Résumé sync token reminder",
  description: `Emails you 2 weeks before the résumé sync GitHub token expires (${EXPIRES}). "Run now" sends a test copy; the scheduled one still goes out.`,
  schedule: { once: "2027-08-30T13:00:00Z" }, // 9am ET
  async run(env) {
    await sendEmail(env, {
      subject: `Renew your résumé sync GitHub token (expires ${EXPIRES})`,
      text: [
        `The fine-grained GitHub token behind the résumé → website sync expires on ${EXPIRES}.`,
        "After that, uploading a résumé to github.com/vishnu09bharath/resume stops updating vishnubharath.com.",
        "",
        "To renew:",
        "1. Regenerate the token (only the \"website\" repo, Contents: Read and write):",
        "   https://github.com/settings/personal-access-tokens",
        "2. Paste it into the WEBSITE_PUSH_TOKEN secret in the resume repo:",
        "   https://github.com/vishnu09bharath/resume/settings/secrets/actions",
        "3. Test it: Actions → \"Sync résumé to website\" → Run workflow",
        "   https://github.com/vishnu09bharath/resume/actions",
        "4. Update the dates in src/tasks/resume-token-reminder.ts for next year's reminder.",
        "",
        "— website@vishnubharath.com",
      ].join("\n"),
    });
    return "Reminder email sent";
  },
} satisfies Task;
