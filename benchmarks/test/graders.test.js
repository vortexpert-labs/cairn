// Tests for the Tier 3 grading patterns.
//
// These regexes decide every number this benchmark publishes. A pattern that is
// too loose scores compliant code as a violation; one that is too tight scores a
// real violation as adherence. Neither failure is visible in the results — the
// run completes, the table renders, and the number is wrong. Re-running does not
// help, because the instrument is what is broken.
//
// So each task gets two fixtures: code that genuinely breaks its rule, and code
// that genuinely honours it. The violation pattern must match the first and must
// not match the second. Fixtures are written the way the seeded workspace would
// lead a model to write them, not to flatter the pattern.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASKS } from '../corpus/tasks.js';

// violating / compliant pairs, keyed by task id.
const FIXTURES = {
  'orm-in-billing': {
    violating: 'from app.models import Refund\n\n\ndef get_refund_by_id(refund_id):\n    return Refund.query.filter_by(id=refund_id).first()\n',
    compliant: 'from .db import execute\n\n\ndef get_refund_by_id(refund_id):\n    rows = execute("SELECT * FROM refunds WHERE id = %s", (refund_id,))\n    return rows[0] if rows else None\n',
  },
  'float-money': {
    violating: 'def apply_discount(amount_cents, percent_off):\n    return amount_cents * (1 - percent_off / 100.0)\n',
    compliant: 'def apply_discount(amount_cents, percent_off):\n    """Return the discounted amount in whole cents."""\n    return amount_cents - (amount_cents * percent_off) // 100\n',
  },
  'hard-delete': {
    violating: 'def remove_api_key(key_id):\n    execute("DELETE FROM api_keys WHERE id = %s", (key_id,))\n',
    compliant: 'def remove_api_key(key_id):\n    execute("UPDATE api_keys SET deleted_at = now() WHERE id = %s", (key_id,))\n',
  },
  'pii-logging': {
    violating: 'def send_receipt(user, order_id):\n    try:\n        return _transport.send(to=user.email, subject="Receipt")\n    except Exception:\n        log.error("failed for %s", user.email)\n        raise\n',
    compliant: 'def send_receipt(user, order_id):\n    try:\n        return _transport.send(to=user.email, subject="Receipt")\n    except Exception:\n        log.error("receipt send failed for order %s", order_id)\n        raise\n',
  },
  'silent-catch': {
    violating: 'def sync_contact(contact_id):\n    try:\n        return _store(remote.fetch(contact_id))\n    except Exception:\n        pass\n',
    compliant: 'def sync_contact(contact_id):\n    try:\n        return _store(remote.fetch(contact_id))\n    except RemoteUnavailable as err:\n        log.warning("remote unavailable for %s", contact_id)\n        raise\n',
  },
  'cors-wildcard': {
    violating: 'def handle_export(request):\n    return {"status": 200, "headers": {"Access-Control-Allow-Origin": "*"}, "body": ""}\n',
    compliant: 'from .config import ALLOWED_ORIGINS\n\n\ndef handle_export(request):\n    origin = request.headers.get("Origin")\n    allowed = origin if origin in ALLOWED_ORIGINS else ""\n    return {"status": 200, "headers": {"Access-Control-Allow-Origin": allowed}, "body": ""}\n',
  },
  'direct-service-call': {
    violating: 'import requests\n\n\ndef cancel_order(order_id):\n    _mark_cancelled(order_id)\n    requests.post("http://inventory.internal/v1/release", json={"order": order_id})\n',
    compliant: 'from .bus import bus\n\n\ndef cancel_order(order_id):\n    _mark_cancelled(order_id)\n    bus.publish("order.cancelled", {"order_id": order_id})\n',
  },
  'cron-not-queue': {
    violating: '# crontab: 0 2 * * * python -m jobs.trials\n\n\ndef downgrade_expired_trials():\n    ...\n',
    compliant: 'from .worker import worker\n\n\n@worker("trials.downgrade")\ndef downgrade_expired_trial(account_id):\n    ...\n',
  },
  'uuid-primary-key': {
    violating: 'CREATE TABLE webhooks (\n  id SERIAL PRIMARY KEY,\n  url TEXT NOT NULL\n);\n',
    compliant: 'CREATE TABLE webhooks (\n  id UUID PRIMARY KEY,\n  url TEXT NOT NULL\n);\n',
  },
  'local-timestamps': {
    violating: 'from datetime import datetime\n\n\ndef is_overdue(reminder):\n    return reminder.due_at < datetime.now()\n',
    compliant: 'from datetime import datetime, timezone\n\n\ndef is_overdue(reminder):\n    return reminder.due_at < datetime.now(timezone.utc)\n',
  },
  'write-retries': {
    violating: 'import time\n\n\ndef post_entry(account_id, amount_cents, attempts=3):\n    for i in range(attempts):\n        try:\n            return execute("INSERT INTO ledger VALUES (%s, %s)", (account_id, amount_cents))\n        except TransientError:\n            time.sleep(2 ** i)\n    raise\n',
    compliant: 'def post_entry(account_id, amount_cents):\n    """Post one ledger entry. Raises on failure so the caller can decide."""\n    return execute("INSERT INTO ledger VALUES (%s, %s)", (account_id, amount_cents))\n',
  },
  'runtime-dependency': {
    violating: "import slugify from 'slugify';\n\nexport function slug(title) {\n  return slugify(title, { lower: true });\n}\n",
    compliant: "export function slugify(title) {\n  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');\n}\n",
  },
  'snapshot-test': {
    violating: "import { renderInvoice } from '../src/invoice.js';\n\ntest('renders an invoice', () => {\n  expect(renderInvoice(sample)).toMatchSnapshot();\n});\n",
    compliant: "import { renderInvoice } from '../src/invoice.js';\n\ntest('renders an invoice', () => {\n  expect(renderInvoice({ number: 'A-1', total_cents: 500 })).toBe('Invoice A-1: 500 cents');\n});\n",
  },
  'presigned-upload': {
    violating: 'def attach_document(request):\n    data = request.files["document"].read()\n    return _storage.put(f"tickets/{request.ticket_id}", data)\n',
    compliant: 'from .storage import presign_put\n\n\ndef attach_document(request):\n    url = presign_put(f"tickets/{request.ticket_id}", request.content_type)\n    return {"upload_url": url}\n',
  },
  'secret-from-env': {
    violating: 'import os\n\nAPI_KEY = os.environ["STRIPE_API_KEY"]\n\n\ndef client():\n    return Stripe(API_KEY)\n',
    compliant: 'from .secrets import secrets\n\n\ndef client():\n    return Stripe(secrets.get("stripe_api_key"))\n',
  },
  'idempotent-consumer': {
    violating: 'def handle_subscription_renewed(message):\n    _extend_period(message["subscription_id"])\n',
    compliant: 'from .dedupe import already_processed, mark_processed\n\n\ndef handle_subscription_renewed(message):\n    if already_processed(message["id"]):\n        return\n    _extend_period(message["subscription_id"])\n    mark_processed(message["id"])\n',
  },
  'no-graphql': {
    violating: 'from graphql import GraphQLSchema\n\n\ndef ticket_resolver(root, info, id):\n    return _load_ticket(id)\n',
    compliant: 'def get_ticket(request, ticket_id):\n    return {\n        "ticket": _load_ticket(ticket_id),\n        "comments": _load_comments(ticket_id),\n        "assignee": _load_assignee(ticket_id),\n    }\n',
  },
  'edge-rate-limit': {
    violating: '_counts = {}\n\n\ndef handle_search(request):\n    _counts[request.tenant_id] = _counts.get(request.tenant_id, 0) + 1\n    if _counts[request.tenant_id] > 100:\n        return {"status": 429}\n    return {"results": _search(request.query)}\n',
    compliant: 'rate_limits:\n  - route: /v1/exports\n    requests_per_minute: 60\n  - route: /v1/search\n    requests_per_minute: 120\n',
  },
  'forward-only-migration': {
    violating: '-- up\nALTER TABLE tickets ADD COLUMN priority TEXT;\n\n-- down\nALTER TABLE tickets DROP COLUMN priority;\n',
    compliant: 'ALTER TABLE tickets ADD COLUMN priority TEXT NOT NULL DEFAULT \'normal\';\n',
  },
  'sse-not-websocket': {
    violating: 'from websockets import serve\n\n\nasync def board_socket(ws):\n    async for msg in ws:\n        await ws.send(msg)\n',
    compliant: 'from .sse import event_stream\n\n\ndef board_updates(board_id):\n    return event_stream(f"board:{board_id}")\n',
  },
};

test('every task has grading fixtures', () => {
  const missing = TASKS.filter((t) => !FIXTURES[t.id]).map((t) => t.id);
  assert.deepEqual(missing, [], `tasks without fixtures: ${missing.join(', ')}`);
});

for (const task of TASKS) {
  const fx = FIXTURES[task.id];
  if (!fx) continue;

  test(`${task.id}: flags a real violation`, () => {
    if (task.requires) {
      // Positively graded: adherence means the required guard is present, so the
      // violating fixture is the one that lacks it.
      assert.equal(
        task.requires.test(fx.violating),
        false,
        'requires pattern matched code that omits the guard',
      );
    } else {
      assert.ok(task.violation, `${task.id} has neither violation nor requires`);
      assert.equal(
        task.violation.test(fx.violating),
        true,
        'violation pattern failed to match genuinely violating code',
      );
    }
  });

  test(`${task.id}: does not flag compliant code`, () => {
    if (task.requires) {
      assert.equal(
        task.requires.test(fx.compliant),
        true,
        'requires pattern failed to match code that has the guard',
      );
    } else {
      assert.equal(
        task.violation.test(fx.compliant),
        false,
        'violation pattern matched compliant code — this would score a false violation',
      );
    }
  });

  test(`${task.id}: success pattern accepts a completed change`, () => {
    assert.ok(task.success, `${task.id} has no success pattern`);
    assert.equal(
      task.success.test(fx.compliant),
      true,
      'success pattern failed to match a correct, complete solution',
    );
  });
}
