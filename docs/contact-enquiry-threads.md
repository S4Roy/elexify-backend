# Contact enquiry conversations

The admin Contact Us inbox now supports portal email replies, private internal remarks, workflow history, priority filtering, and paginated conversations. Existing enquiries and their embedded notes remain readable without a data migration; missing priorities appear as Normal.

## API and access

- `GET admin/contact-us/:id/thread?page=1`: requires `contacts.view`; returns the original enquiry plus 20 conversation entries per page, newest pages first.
- `POST admin/contact-us/:id/messages`: requires `contacts.update`; accepts `{ request_id: UUIDv4, kind: "reply" | "note", content: string }`. Content is trimmed, required, and limited to 10,000 characters.
- `PUT admin/contact-us/edit`: requires `contacts.update`; accepts `_id`, `status` (including `pending` for reopening), and `priority` (`low`, `normal`, `high`, `urgent`). Status and priority changes are stored atomically as private workflow entries with actor and time. Concurrent changes return 409.
- Archived/spam enquiries must be reopened before a reply. Internal remarks remain available. Deleted enquiries cannot be opened or replied to.

## Email and send states

Replies use the existing managed SMTP credentials and branded email shell. Replies have a stable ticket subject, Message-ID, and In-Reply-To/References to preceding accepted replies. Reply-To points to the existing support mailbox. Only the composed customer reply enters the email; internal remarks and workflow history are never included. SMTP acceptance is labelled as acceptance, not inbox delivery.

A reply is saved before sending. The unique `(contact_id, request_id)` index prevents duplicate sends on repeat requests. Index initialization is awaited before a new message is written. Reusing an ID with another body, kind, or actor returns 409.

- `sending`: send in progress, or a process stopped before the final send state was persisted. Do not automatically retry.
- `sent`: SMTP accepted the recipient; enquiry is marked answered if its workflow status has not changed meanwhile.
- `failed`: email was definitely not sent (for example SMTP disabled or recipient rejected). Correct configuration and explicitly send again.
- `unknown`: sending could not be confirmed. Check the support mailbox/provider logs before creating a new reply. Repeating the same request ID checks the recorded state and does not send again.

After a network failure, the portal retains the draft and request ID; retrying an unchanged draft checks the same operation. Messages are append-only in the portal.

Deploy both backend and admin panel. MongoDB creates the `contact_us_messages` collection and indexes through the model initialization. No live email is sent by tests.

## Scope

Customer responses arrive in the support mailbox. Automatic inbound email capture, attachments, assignment, and SLA automation are outside this version. No inbound webhook or mailbox polling has been added.
