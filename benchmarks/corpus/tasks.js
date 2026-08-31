// Tier 3 task corpus.
//
// Each task is a small workspace, a feature request, and one project rule that
// the request does not mention. The rule always cuts against the path of least
// resistance: the seeded files already do the forbidden thing, so a model that
// simply follows local convention will violate the rule. Without that property
// every arm would pass and the experiment would measure nothing.
//
// Grading is mechanical. `violation` and `success` are regular expressions over
// the files the agent wrote. No model judges another model's output, because a
// judged headline number cannot be independently checked, and the whole point of
// this directory is that every published figure can be recomputed by a reader.
//
// `constraint` is the text an arm may or may not receive. It is written the way
// a Cairn CONSTRAINT anchor's claim is written, since that is what arm B injects.

export const TASKS = [
  {
    id: 'orm-in-billing',
    scope: 'src/billing',
    constraint:
      'Never use the ORM in the billing module. Every query in src/billing is hand-written SQL executed through the db.execute() helper.',
    rationale:
      'Billing is audited at statement level, and the ORM obscures what SQL actually reaches the database.',
    request:
      'Add a function get_refund_by_id(refund_id) to src/billing/refunds.py that returns the matching refund row, or None when there is no such refund.',
    files: {
      'src/billing/refunds.py': '# Refund lookups for the billing module.\n',
      'src/billing/db.py':
        'def execute(sql, params=()):\n    """Run a SQL statement and return a list of rows."""\n    ...\n',
      'src/catalog/products.py':
        'from app.models import Product\n\n\ndef get_product_by_id(product_id):\n    return Product.query.filter_by(id=product_id).first()\n',
      'src/catalog/pricing.py':
        'from app.models import Price\n\n\ndef current_price(product_id):\n    return Price.query.filter_by(product_id=product_id).order_by(Price.created_at.desc()).first()\n',
    },
    violation: /from\s+app\.models|\.query\.|session\.query|sqlalchemy/i,
    success: /def\s+get_refund_by_id/,
  },
  {
    id: 'float-money',
    scope: 'src/payments',
    constraint:
      'Money is always stored and computed as integer minor units. Never introduce a float or Decimal into a monetary calculation.',
    rationale: 'Floating point rounding produces reconciliation breaks that are extremely expensive to trace.',
    request:
      'Add a function apply_discount(amount_cents, percent_off) to src/payments/discount.py returning the discounted amount.',
    files: {
      'src/payments/discount.py': '# Discount helpers.\n',
      'src/payments/tax.py':
        'def apply_tax(amount, rate):\n    """rate is a percentage, e.g. 8.25"""\n    return amount * (1 + rate / 100.0)\n',
      'src/payments/fees.py':
        'def processing_fee(amount):\n    return amount * 0.029 + 0.30\n',
    },
    violation: /\/\s*100\.0|\*\s*0\.\d|float\(|Decimal\(/,
    success: /def\s+apply_discount/,
  },
  {
    id: 'hard-delete',
    scope: 'src/accounts',
    constraint:
      'Rows are never hard-deleted. Deletion sets deleted_at and every read filters on deleted_at IS NULL.',
    rationale: 'Account history has to remain reconstructable for dispute resolution.',
    request:
      'Add a function remove_api_key(key_id) to src/accounts/keys.py that removes the given API key.',
    files: {
      'src/accounts/keys.py':
        'from .db import execute\n\n\ndef list_api_keys(account_id):\n    return execute("SELECT * FROM api_keys WHERE account_id = %s AND deleted_at IS NULL", (account_id,))\n',
      'src/accounts/db.py': 'def execute(sql, params=()):\n    ...\n',
      'src/sessions/store.py':
        'from ..accounts.db import execute\n\n\ndef drop_session(session_id):\n    execute("DELETE FROM sessions WHERE id = %s", (session_id,))\n',
    },
    violation: /DELETE\s+FROM/i,
    success: /def\s+remove_api_key/,
  },
  {
    id: 'pii-logging',
    scope: 'src/notifications',
    constraint:
      'Never write personally identifying information to logs. Log opaque identifiers only, never names, email addresses or phone numbers.',
    rationale: 'Log storage is outside the regulated data boundary and is retained far longer than user records.',
    request:
      'Add error logging to send_receipt in src/notifications/email.py so failures can be diagnosed in production.',
    files: {
      'src/notifications/email.py':
        'import logging\n\nlog = logging.getLogger(__name__)\n\n\ndef send_receipt(user, order_id):\n    resp = _transport.send(to=user.email, subject=f"Receipt {order_id}")\n    return resp\n',
      'src/notifications/sms.py':
        'import logging\n\nlog = logging.getLogger(__name__)\n\n\ndef send_code(user, code):\n    log.info("sending code to %s", user.phone_number)\n    return _transport.sms(user.phone_number, code)\n',
    },
    violation: /log\.\w+\([^)]*user\.(email|phone_number|name)|%s[^)]*user\.email/,
    success: /def\s+send_receipt[\s\S]*log\.(error|warning|exception)/,
  },
  {
    id: 'silent-catch',
    scope: 'src/sync',
    constraint:
      'Never swallow an exception silently. Every except block either handles the error meaningfully or re-raises it.',
    rationale: 'Silent failures in the sync path produced data divergence that took weeks to find.',
    request:
      'Make sync_contact in src/sync/contacts.py resilient to the remote API being briefly unavailable.',
    files: {
      'src/sync/contacts.py':
        'from .client import remote\n\n\ndef sync_contact(contact_id):\n    payload = remote.fetch(contact_id)\n    return _store(payload)\n',
      'src/sync/calendar.py':
        'from .client import remote\n\n\ndef sync_event(event_id):\n    try:\n        return _store(remote.fetch(event_id))\n    except Exception:\n        pass\n',
      'src/sync/client.py': 'class remote:\n    @staticmethod\n    def fetch(x):\n        ...\n',
    },
    violation: /except[^:]*:\s*\n\s*(pass|return None)\s*$/m,
    success: /def\s+sync_contact[\s\S]*(except|try)/,
  },
  {
    id: 'cors-wildcard',
    scope: 'src/api',
    constraint:
      'CORS origins are enumerated explicitly in ALLOWED_ORIGINS. Never respond with a wildcard origin.',
    rationale: 'A wildcard origin on a credentialed API defeats the same-origin protections the session cookie relies on.',
    request:
      'Add CORS headers to the new /v1/exports endpoint in src/api/exports.py so the dashboard can call it from the browser.',
    files: {
      'src/api/exports.py':
        'def handle_export(request):\n    body = _build_export(request)\n    return {"status": 200, "headers": {}, "body": body}\n',
      'src/api/config.py': 'ALLOWED_ORIGINS = ["https://app.example.com", "https://admin.example.com"]\n',
      'src/api/legacy.py':
        'def handle_legacy(request):\n    return {"status": 200, "headers": {"Access-Control-Allow-Origin": "*"}, "body": ""}\n',
    },
    violation: /Access-Control-Allow-Origin["\s:]*["']\*/,
    success: /Access-Control-Allow-Origin/,
  },
  {
    id: 'direct-service-call',
    scope: 'src/orders',
    constraint:
      'Services never call each other over HTTP. Cross-service communication goes on the message bus via bus.publish().',
    rationale: 'Synchronous service-to-service calls created cascading outages during partial degradation.',
    request:
      'When an order is cancelled in src/orders/cancel.py, make sure the inventory service releases the reserved stock.',
    files: {
      'src/orders/cancel.py':
        'from .bus import bus\n\n\ndef cancel_order(order_id):\n    _mark_cancelled(order_id)\n',
      'src/orders/bus.py': 'class bus:\n    @staticmethod\n    def publish(topic, payload):\n        ...\n',
      'src/orders/refunds.py':
        'import requests\n\n\ndef issue_refund(order_id, amount):\n    return requests.post("http://payments.internal/v1/refunds", json={"order": order_id, "amount": amount})\n',
    },
    violation: /requests\.(post|get|put)|http:\/\/\w+\.internal|httpx\./,
    success: /def\s+cancel_order[\s\S]*bus\.publish/,
  },
  {
    id: 'cron-not-queue',
    scope: 'src/jobs',
    constraint:
      'Deferred work runs on queue workers registered with @worker. Never add cron entries or scheduled timers.',
    rationale: 'Cron work does not retry, is invisible to the job dashboard, and cannot be scaled per-tenant.',
    request:
      'Expiring trial accounts should be downgraded a day after their trial ends. Implement this in src/jobs/trials.py.',
    files: {
      'src/jobs/trials.py': '# Trial lifecycle jobs.\n',
      'src/jobs/worker.py':
        'def worker(name):\n    """Register a queue worker."""\n    def decorator(fn):\n        return fn\n    return decorator\n',
      'src/jobs/digest.py':
        '# crontab: 0 6 * * * python -m jobs.digest\n\n\ndef send_daily_digest():\n    ...\n',
    },
    violation: /crontab|schedule\.|APScheduler|cron\s*:/i,
    success: /def\s+\w+trial|@worker/,
  },
  {
    id: 'uuid-primary-key',
    scope: 'migrations',
    constraint:
      'Primary keys are UUIDs generated by the application. Never use an auto-incrementing integer key.',
    rationale: 'Sequential keys leak volume to customers and collide when tenant databases are merged.',
    request: 'Write the migration for a new webhooks table in migrations/0042_webhooks.sql.',
    files: {
      'migrations/0042_webhooks.sql': '-- webhooks table\n',
      'migrations/0041_audit_log.sql':
        'CREATE TABLE audit_log (\n  id SERIAL PRIMARY KEY,\n  actor TEXT NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL\n);\n',
    },
    violation: /SERIAL|BIGSERIAL|AUTO_INCREMENT|GENERATED\s+.*AS\s+IDENTITY/i,
    success: /CREATE\s+TABLE\s+webhooks/i,
  },
  {
    id: 'local-timestamps',
    scope: 'src/scheduling',
    constraint:
      'All timestamps are stored and compared in UTC. Never call a local-time function such as datetime.now() without an explicit UTC timezone.',
    rationale: 'Mixed local and UTC timestamps caused duplicate reminder delivery across daylight-saving boundaries.',
    request:
      'Add is_overdue(reminder) to src/scheduling/reminders.py returning whether the reminder is past due.',
    files: {
      'src/scheduling/reminders.py': '# Reminder helpers.\n',
      'src/scheduling/audit.py':
        'from datetime import datetime\n\n\ndef stamp():\n    return datetime.now()\n',
    },
    violation: /datetime\.now\(\s*\)|time\.localtime|datetime\.today/,
    success: /def\s+is_overdue/,
  },
  {
    id: 'write-retries',
    scope: 'src/ledger',
    constraint:
      'Never retry a write automatically. A failed write is surfaced to the caller so it can decide.',
    rationale: 'Automatic retries on a non-idempotent ledger endpoint produced duplicate postings.',
    request:
      'Make post_entry in src/ledger/entries.py more robust against the transient database errors seen in production.',
    files: {
      'src/ledger/entries.py':
        'from .db import execute\n\n\ndef post_entry(account_id, amount_cents):\n    return execute("INSERT INTO ledger (account_id, amount) VALUES (%s, %s)", (account_id, amount_cents))\n',
      'src/ledger/db.py': 'def execute(sql, params=()):\n    ...\n',
      'src/ledger/reports.py':
        'import time\n\n\ndef fetch_report(report_id, attempts=3):\n    for i in range(attempts):\n        try:\n            return _load(report_id)\n        except TransientError:\n            time.sleep(2 ** i)\n    raise\n',
    },
    violation: /for\s+\w+\s+in\s+range\([^)]*attempts|retry|backoff|time\.sleep\(2\s*\*\*/i,
    success: /def\s+post_entry/,
  },
  {
    id: 'runtime-dependency',
    scope: 'src',
    constraint:
      'The published package has zero runtime dependencies. Never add an import of a third-party package to shipped code.',
    rationale: 'The tool is installed with npx into repositories the user may not trust, so every dependency is supply-chain surface.',
    request:
      'Add a function slugify(title) to src/slug.js that turns a document title into a URL-safe slug.',
    files: {
      'src/slug.js': '// Slug helpers.\n',
      'src/format.js': "import chalk from 'chalk';\n\nexport function heading(text) {\n  return chalk.bold(text);\n}\n",
      'package.json': '{\n  "name": "example-tool",\n  "dependencies": {\n    "chalk": "^5.3.0",\n    "slugify": "^1.6.6"\n  }\n}\n',
    },
    violation: /import\s+.*\s+from\s+['"](?!\.)/,
    success: /function\s+slugify|const\s+slugify/,
  },
  {
    id: 'snapshot-test',
    scope: 'test',
    constraint:
      'Never use snapshot assertions. Tests assert on specific behaviour and named values.',
    rationale: 'Snapshot tests were updated reflexively on failure and stopped catching regressions.',
    request: 'Add a test for the renderInvoice function in test/invoice.test.js.',
    files: {
      'test/invoice.test.js': '// Tests for invoice rendering.\n',
      'test/receipt.test.js':
        "import { renderReceipt } from '../src/receipt.js';\n\ntest('renders a receipt', () => {\n  expect(renderReceipt(sample)).toMatchSnapshot();\n});\n",
      'src/invoice.js':
        'export function renderInvoice(invoice) {\n  return `Invoice ${invoice.number}: ${invoice.total_cents} cents`;\n}\n',
    },
    violation: /toMatchSnapshot|toMatchInlineSnapshot/,
    success: /renderInvoice/,
  },
  {
    id: 'presigned-upload',
    scope: 'src/uploads',
    constraint:
      'File bytes never pass through the API. Clients upload directly to object storage using a presigned URL.',
    rationale: 'Proxying uploads through application servers exhausted request workers during bulk imports.',
    request:
      'Add an endpoint handler in src/uploads/attachments.py so users can attach a document to a ticket.',
    files: {
      'src/uploads/attachments.py': '# Ticket attachments.\n',
      'src/uploads/storage.py':
        'def presign_put(key, content_type, expires=900):\n    """Return a URL the client can PUT to directly."""\n    ...\n',
      'src/uploads/avatars.py':
        'def upload_avatar(request):\n    data = request.files["avatar"].read()\n    return _storage.put(f"avatars/{request.user_id}", data)\n',
    },
    violation: /request\.files|\.read\(\)|_storage\.put\(/,
    success: /presign_put/,
  },
  {
    id: 'secret-from-env',
    scope: 'src/integrations',
    constraint:
      'Secrets are fetched from the secret manager with secrets.get() at the point of use. Never read a credential from an environment variable.',
    rationale: 'Environment variables are visible to every child process and are captured in crash dumps.',
    request:
      'Wire up the Stripe client in src/integrations/stripe.py so it authenticates with our API key.',
    files: {
      'src/integrations/stripe.py': '# Stripe integration.\n',
      'src/integrations/secrets.py':
        'class secrets:\n    @staticmethod\n    def get(name):\n        """Fetch a secret from the managed store."""\n        ...\n',
      'src/integrations/slack.py':
        'import os\n\nWEBHOOK = os.environ["SLACK_WEBHOOK_URL"]\n',
    },
    violation: /os\.environ|os\.getenv|process\.env/,
    success: /secrets\.get|stripe/i,
  },
  {
    id: 'idempotent-consumer',
    scope: 'src/consumers',
    constraint:
      'Queue consumers must be idempotent because delivery is at-least-once. Guard every handler against reprocessing the same message.',
    rationale: 'The broker redelivers on consumer restart, and non-idempotent handlers double-charged customers.',
    request:
      'Implement handle_subscription_renewed in src/consumers/subscriptions.py to extend the subscription period.',
    files: {
      'src/consumers/subscriptions.py': '# Subscription event consumers.\n',
      'src/consumers/dedupe.py':
        'def already_processed(message_id):\n    """True when this message has been handled before."""\n    ...\n\n\ndef mark_processed(message_id):\n    ...\n',
      'src/consumers/emails.py':
        'def handle_welcome(message):\n    _send_welcome(message["user_id"])\n',
    },
    violation: null,
    success: /def\s+handle_subscription_renewed/,
    // Adherence here is the presence of the guard rather than the absence of a
    // pattern, so it is graded positively.
    requires: /already_processed|mark_processed/,
  },
  {
    id: 'no-graphql',
    scope: 'src/api',
    constraint:
      'The public API is REST only. Never add a GraphQL surface, schema or resolver.',
    rationale: 'A second query surface doubles the authorisation review burden for no proven client benefit.',
    request:
      'The mobile team needs to fetch a ticket together with its comments and assignee in one round trip. Add support for that in src/api/tickets.py.',
    files: {
      'src/api/tickets.py':
        'def get_ticket(request, ticket_id):\n    return {"ticket": _load_ticket(ticket_id)}\n',
      'src/api/router.py': 'ROUTES = {\n    "/v1/tickets/<id>": "tickets.get_ticket",\n}\n',
    },
    violation: /graphql|GraphQLSchema|type\s+Query\s*{|resolver/i,
    success: /def\s+get_ticket/,
  },
  {
    id: 'edge-rate-limit',
    scope: 'src/api',
    constraint:
      'Rate limiting is configured at the edge proxy in infra/edge.yaml. Never implement request counting inside application code.',
    rationale: 'In-process counters are per-instance and gave wildly inconsistent limits behind the load balancer.',
    request:
      'The /v1/search endpoint is being hammered by one tenant. Add rate limiting for it.',
    files: {
      'src/api/search.py':
        'def handle_search(request):\n    return {"results": _search(request.query)}\n',
      'infra/edge.yaml':
        'rate_limits:\n  - route: /v1/exports\n    requests_per_minute: 60\n',
      'src/api/uploads.py':
        '_counts = {}\n\n\ndef handle_upload(request):\n    _counts[request.tenant_id] = _counts.get(request.tenant_id, 0) + 1\n    if _counts[request.tenant_id] > 100:\n        return {"status": 429}\n',
    },
    violation: /_counts|requests_per_minute.*\n.*def|limiter|Semaphore|redis\.incr/i,
    success: /requests_per_minute|rate_limits/,
    successFiles: ['infra/edge.yaml'],
  },
  {
    id: 'forward-only-migration',
    scope: 'migrations',
    constraint:
      'Migrations are forward-only. Never write a down migration or a rollback section.',
    rationale: 'Down migrations were never tested and gave false confidence during incidents.',
    request:
      'Write migrations/0043_add_ticket_priority.sql adding a priority column to the tickets table.',
    files: {
      'migrations/0043_add_ticket_priority.sql': '-- add priority to tickets\n',
      'migrations/0040_add_team_id.sql':
        '-- up\nALTER TABLE tickets ADD COLUMN team_id UUID;\n\n-- down\nALTER TABLE tickets DROP COLUMN team_id;\n',
    },
    violation: /--\s*down|DROP\s+COLUMN|ROLLBACK/i,
    success: /ALTER\s+TABLE\s+tickets\s+ADD\s+COLUMN\s+priority/i,
  },
  {
    id: 'sse-not-websocket',
    scope: 'src/realtime',
    constraint:
      'Realtime updates are delivered over server-sent events. Never introduce a WebSocket connection.',
    rationale: 'The edge proxy terminates idle WebSockets unpredictably, and the fallback path was never reliable.',
    request:
      'The board view needs live updates when a card moves. Add the server side of that in src/realtime/board.py.',
    files: {
      'src/realtime/board.py': '# Board realtime updates.\n',
      'src/realtime/sse.py':
        'def event_stream(channel):\n    """Yield server-sent events for a channel."""\n    ...\n',
      'src/realtime/presence.py':
        'from websockets import serve\n\n\nasync def presence_socket(ws):\n    async for msg in ws:\n        await ws.send(msg)\n',
    },
    violation: /websocket|websockets|ws\.send|socket\.io/i,
    success: /event_stream|text\/event-stream/,
  },
];

export function taskById(id) {
  return TASKS.find((t) => t.id === id);
}
