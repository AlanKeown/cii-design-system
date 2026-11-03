<svelte:head><title>Privacy · Common Ground demo</title></svelte:head>
<main class="auth-panel">
  <h1>Privacy and demo data</h1>
  <p>
    Common Ground is a demonstration. Enter fictional records only. Do not enter
    real member, donor, health or case information.
  </p>
  <p>
    Without an account, records and drafts stay in this browser. Clearing
    browser storage removes them. Account workspaces store records in Supabase
    and are served through Cloudflare. Account records and drafts are not copied
    to browser storage.
  </p>
  <p>
    Signing in uses your email address. Email providers process the recipient
    address and sign-in email. Production email delivery is planned through
    Resend in Tokyo, outside Australia; local development uses Mailpit without
    outbound delivery.
  </p>
  <p>
    Organisation members can access records according to their assigned role.
    Administrators can manage memberships and see audit activity. Invitations
    expire after seven days. Only use invitation links intended for your email
    address.
  </p>
  <p>
    Demo organisations inactive for 30 days and accounts inactive for 90 days
    are scheduled for deletion. Audit history is limited to the most recent 500
    entries per organisation. Scheduling takes effect where the database
    migrations are installed.
  </p>
  <p>
    Reset demo data replaces your organisation’s records. Delete my account
    removes your account and organisations you own, including records shared
    with other members. Signing out leaves account data in place.
  </p>
  <a href="/">Back to workspace</a>
</main>
