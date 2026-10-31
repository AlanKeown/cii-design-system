Great call. Here’s a **complete, handoff-ready product design spec** you can give directly to a designer or engineer.

---

# Community Organisation Portal — Product Design Specification (v1.0)

## 1) Product summary

A role-based web portal for community organisations to manage:
- Members / people
- Programs / services
- Events
- Donations
- Support cases / requests
- Reporting
- Administration (users, permissions, data settings)

**Primary UX model:** Dashboard + record lists + record detail + guided workflows + reporting.

**Design style:** Modern nonprofit / civic operations  
**Brand direction:** Deep blue primary + lilac accent  
**Themes:** Light + Dark

---

## 2) Users and roles

### 2.1 Primary roles
1. **Admin**
   - Full system access, configuration, permissions, data fields, audit
2. **Staff**
   - Day-to-day operations: members, programs, events, cases, reports
3. **Volunteer Coordinator**
   - Volunteer records, events, assignments, communication
4. **Fundraising / Donations Manager**
   - Donor records, campaign tracking, receipts, donation reports
5. **Case Worker / Service Coordinator**
   - Support requests, case updates, notes, deadlines
6. **Read-only / Board member (optional)**
   - Reporting and selected view-only modules

### 2.2 UX requirement
- Navigation, actions, and visible data must be role-aware.
- If a user lacks permission, hide unavailable actions (not just disable).

---

## 3) Information architecture

Top-level modules:
1. Dashboard
2. Members
3. Programs
4. Events
5. Donations
6. Cases
7. Reports
8. Administration

Global shell:
- **Left sidebar:** primary module navigation
- **Top bar:** search, quick add, notifications, theme toggle, profile menu
- **Main content:** module views
- **Optional right rail:** contextual quick actions / alerts

---

## 4) Core workflows (must support)

1. **Create/update member record**
2. **Assign member to program**
3. **Create/manage event + attendance**
4. **Record donation + donor history**
5. **Open/update/close support case**
6. **Run/export report**
7. **Admin: manage users/roles/permissions**

Each workflow must support:
- Validation
- Save draft (where multi-step)
- Clear success/failure state
- Audit metadata (“Updated by”, “Updated at”)

---

## 5) Functional page requirements

## 5.1 Dashboard
Purpose: operational overview and action prioritization.

Required sections:
- KPI cards (4–6): active members, open cases, upcoming events, donations (period)
- My tasks/priorities
- Alerts / needs attention
- Recent activity feed
- Upcoming events snapshot
- Quick actions (add member/event/donation/case)

Acceptance:
- Loads in <2s on standard org data size
- Cards clickable to filtered module views
- Role-specific content

## 5.2 Members module

### List page
Required:
- Search (name/email/phone/tags)
- Filters (status, role, location, membership type, date ranges)
- Sort
- Saved views
- Bulk actions
- Export CSV/XLSX

Table columns (default):
- Name, Status, Membership Type, Last Contact, Location, Tags, Updated At

### Detail page
Tabs:
- Overview
- Activity timeline
- Notes
- Documents
- Related records (programs/events/cases/donations)

Header:
- Name, status, key metadata, quick actions (edit, note, message)

## 5.3 Programs module
- Program list + status/capacity
- Program detail:
  - Summary
  - Participants
  - Schedule
  - Staff/volunteer assignments
  - Outcomes/reporting snapshot

## 5.4 Events module
- Calendar view + list view
- Event detail:
  - Summary
  - Attendees
  - Check-in
  - Tasks
  - Linked records
- Attendance import/export optional

## 5.5 Donations module
- Donation transactions list
- Donor profiles + donation history
- Campaign performance
- Recurring donation tracking
- Acknowledgement status

## 5.6 Cases module
- Queue view with priority/status/assignee/due date
- Case detail:
  - Summary
  - Timeline
  - Actions
  - Linked people/docs
- SLA/overdue indicators

## 5.7 Reports module
- Standard reports (members/programs/events/donations/cases)
- Date range + filter controls
- Export: CSV/XLSX/PDF
- Optional scheduled reports (email)

## 5.8 Administration module
- Users
- Roles
- Permissions matrix
- Custom fields
- Data settings
- Audit log
- Integrations (optional phase 2)

---

## 6) UX and interaction requirements

## 6.1 General UX rules
- Prefer list/table-first for operational modules
- Keep key actions visible above fold
- Maintain consistent page structure:
  - Title row
  - Controls row (search/filter/actions)
  - Content block (table/cards)
  - Pagination/footer

## 6.2 Form behavior
- Labels above fields
- Required fields clearly marked
- Inline validation on blur + on submit
- Error summary at top for multi-error submit
- Save Draft for long forms
- Confirm destructive actions

## 6.3 Feedback states
- Loading: skeletons/spinners
- Success: inline toast + persistent audit update
- Error: actionable message (what failed + next step)
- Empty states: explain and provide CTA

## 6.4 Accessibility (non-negotiable)
- WCAG 2.2 AA target
- Full keyboard navigation
- Visible focus ring
- Screen reader labels for all controls
- Semantic headings and landmarks
- No color-only status communication

---

## 7) Visual design system (tokenized)

## 7.1 Color tokens — Light
- brand.primary `#122B4D`
- brand.primary.strong `#0A1730`
- brand.primary.soft `#DDE8F7`
- brand.secondary `#A88BFF`
- brand.secondary.soft `#EEE7FF`
- bg.page `#F5F7FB`
- bg.card `#FFFFFF`
- border.default `#D9E2F0`
- text.primary `#152232`
- text.secondary `#4F5F74`
- status.success `#2F8F6B`
- status.warning `#C88B2A`
- status.error `#C85652`
- status.info `#3D6BB5`
- focus.ring `#8D76F7`

## 7.2 Color tokens — Dark
- brand.primary `#173A63`
- brand.primary.strong `#0F2C4B`
- brand.secondary `#B39BFF`
- brand.secondary.soft `#2E2747`
- bg.page `#0A121C`
- bg.card `#101B2A`
- border.default `#22344C`
- text.primary `#EDF3FF`
- text.secondary `#BAC9DF`
- status.success `#5DB98C`
- status.warning `#D7A94B`
- status.error `#D66D68`
- status.info `#7AA8FF`
- focus.ring `#B39BFF`

## 7.3 Typography
- Font: Inter (fallback system sans-serif)
- H1: 28/36 700
- H2: 22/30 600
- H3: 18/26 600
- Body: 14/21 400
- Label: 12/18 500
- Caption: 11/16 500

## 7.4 Spacing and radius
- Spacing scale: 4, 8, 12, 16, 24, 32, 40, 48, 64
- Radius: 8 (inputs), 10 (buttons), 14 (cards), full (pills)
- Grid: 8px baseline

---

## 8) Component specification

Required components (designer + engineer must implement):

1. App shell (topbar/sidebar/content)
2. Buttons (primary/secondary/tertiary/danger/icon)
3. Inputs (text, textarea, select, multiselect, date, checkbox, radio, toggle)
4. Search + filter bar
5. Data table (sortable, selectable, paginated)
6. Status chips / tags
7. Cards (metric, info, actionable)
8. Tabs
9. Modal + drawer
10. Toast / inline alert / banner
11. Empty state block
12. Activity timeline
13. Pagination control
14. Breadcrumbs
15. Command/quick action menu

Each component must include:
- Light + dark variants
- Default/hover/focus/active/disabled/error states
- Accessibility notes
- Usage and anti-pattern notes

---

## 9) Data table spec (critical)

Minimum features:
- Sticky header
- Column sort
- Column visibility toggle
- Row selection + bulk actions
- Per-column filter (as applicable)
- Quick search
- Pagination (server-side preferred)
- Empty/loading/error states

Density modes:
- Comfortable (default)
- Compact (optional toggle)

Row action pattern:
- Primary quick action inline
- Overflow menu for secondary actions

---

## 10) Responsive behavior

Breakpoints:
- Desktop: 1280+
- Laptop/tablet landscape: 1024–1279
- Tablet portrait: 768–1023
- Mobile: <768

Rules:
- Sidebar collapses below 1024
- Tables become horizontally scrollable on small screens
- Priority actions remain visible on mobile
- Long forms become single-column on tablet/mobile

---

## 11) Content design guidelines

Voice:
- Direct, clear, supportive, neutral

Microcopy rules:
- Use verb-first actions (“Add member”, “Export report”)
- Use plain-language errors (“Couldn’t save changes. Check required fields.”)
- Avoid jargon unless domain-required

Date/time:
- Display local timezone consistently
- Relative + absolute where useful (e.g., “2 hours ago (Oct 26, 2026, 14:10)”)

---

## 12) Security, trust, and audit UX

Must show in UI:
- Record updated by / updated at
- Permission-limited actions
- Confirmation for destructive actions
- Audit access in Administration

Recommended:
- Soft-lock warning for concurrent edits
- PII visibility controls by role
- Session timeout warning modal

---

## 13) Implementation architecture recommendations

Frontend:
- Component-based design system (tokens + primitives + composites)
- Theme engine via CSS variables / design tokens
- Form library with schema validation
- Table engine supporting server-side operations

Backend/API expectations:
- Pagination, filtering, sorting endpoints
- Role/permission metadata in responses
- Audit metadata on records
- Optimistic concurrency support (preferred)

---

## 14) Handoff deliverables checklist

For Designer:
- [ ] Figma library (tokens, components, patterns)
- [ ] Key page mockups (Dashboard, Members list/detail, Case detail, Report view, Admin roles)
- [ ] Light and dark mode frames
- [ ] Interaction notes and component states
- [ ] Accessibility annotation pass

For Engineer:
- [ ] Token file (JSON/CSS vars)
- [ ] Component implementation spec
- [ ] Page-level layout specs
- [ ] Interaction/state matrix
- [ ] API contract assumptions
- [ ] QA acceptance criteria

---

## 15) MVP scope (recommended)

Include in MVP:
- Dashboard
- Members (list/detail/create/edit)
- Events (list/detail)
- Donations (list/detail)
- Cases (queue/detail)
- Reports (basic exports)
- Admin users/roles
- Light + dark theme
- Core accessibility compliance

Defer to phase 2:
- Advanced automation
- Integrations marketplace
- Deep analytics builder
- Custom workflow builder
- Advanced notifications orchestration

---

## 16) Acceptance criteria (release gate)

A build is “design complete” when:
1. All core modules implemented with consistent shell + navigation
2. Token-driven light/dark themes fully functional
3. All core components support interactive states
4. Accessibility checks pass for critical flows
5. Core workflows complete without dead ends
6. Role-based visibility and permissions reflected in UI
7. Table/search/filter/reporting behaviors meet performance targets
8. Error/success/loading states implemented across major actions

---

If you want, next I can generate this as:
1) a **Markdown spec file** structure for your repo, and  
2) a **starter token JSON + CSS variables file** your frontend team can implement immediately.