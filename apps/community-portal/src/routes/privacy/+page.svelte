<svelte:head><title>Privacy · Common Ground demo</title></svelte:head>
<main class="auth-panel">
  <h1>Privacy and demo data</h1>
  <p>
    Common Ground is a demonstration. Enter fictional records only. Do not enter
    real member, donor, health or case information.
  </p>
  <p>
    Without an account, records and drafts stay in this browser until you clear
    browser storage. Account workspaces store records with Supabase and are
    served through Cloudflare. Account records and drafts are not copied to
    browser storage.
  </p>
  <p>
    Account sign-in uses your email address, display name and sign-in metadata.
    Essential cookies keep you signed in and remember your selected
    organisation. Cloudflare hosts the portal and provides Turnstile challenges
    for sign-in.
  </p>
  <p>
    When account sign-in is available on this site, production account records
    are stored with Supabase in Sydney, Australia. Sign-in emails use Resend in
    Tokyo, outside Australia. The email provider processes your recipient
    address and sign-in email, including the code and confirmation link.
  </p>
  <p>
    Supabase Auth, Cloudflare request/challenge logs and email delivery logs may
    retain operational metadata under their own retention policies. If you
    choose GitHub sign-in, authentication also uses GitHub and the account
    information you share with it.
  </p>
  <p>
    Organisation members can access records according to their assigned role.
    Administrators can manage memberships and see audit activity. Invitations
    expire after seven days. Only use invitation links intended for your email
    address.
  </p>
  <p>
    Account organisations inactive for 30 days and accounts inactive for 90 days
    are scheduled for deletion. The portal shows the most recent 500 audit
    entries per organisation. Browser-only records remain on your device until
    you clear them.
  </p>
  <p>
    Reset demo data replaces your organisation’s records. Delete my account
    removes your account and organisations you own, including records shared
    with other members. Signing out leaves account data in place.
  </p>
  <a href="/">Back to workspace</a>
</main>
