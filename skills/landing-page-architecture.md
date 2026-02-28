---
name: landing-page-architecture
description: Build conversion-optimized landing pages with psychologically sequenced sections, battle-tested copy formulas, and semantic HTML. Produces copy, code, or both for opt-in pages, sales pages, and product launches.
triggers:
  - landing page
  - sales page
  - opt-in page
  - squeeze page
  - launch page
  - conversion page
  - lead capture page
  - product page
allowed-tools: Read, Write, Edit, Grep, Glob, WebSearch, AskUserQuestion
---

# Landing Page Architect

Build landing pages where every section has a job, every sentence earns attention, and the architecture itself is the persuasion engine.

## Why This Matters

- **Architecture beats aesthetics** — A gorgeous page in the wrong order converts at zero. The sequence IS the argument.
- **Sequence is persuasion** — Each section pre-sells the next. Hero earns the scroll. Problem earns the listen. Value stack earns the click.
- **Jobs drive decisions** — Every section exists to accomplish one psychological task. If a section can't state its job in one sentence, it doesn't belong.
- **Copy is the conversion layer** — Design gets attention. Copy gets action. When those conflict, copy wins on structural elements.

---

## Discovery Workflow

Before writing a single headline, gather context. Use `AskUserQuestion` to ask the following. All six required questions should be presented together in the first prompt.

### Required Questions

1. **What are you selling?** — Product, service, course, SaaS, physical product. Include price point if known.
2. **Who is buying?** — Demographics, psychographics, sophistication level. The more specific, the sharper the copy.
3. **What is their #1 pain?** — The problem that wakes them up at 3am. Not the surface complaint — the deeper frustration.
4. **What is the transformation promise?** — Before state to after state. "From X to Y in Z timeframe."
5. **What is the offer structure?** — Core offer, bonuses, guarantee, urgency/scarcity if any.
6. **What is the primary action?** — Email opt-in, purchase, book a call, start free trial, join waitlist.

### Optional Follow-ups

After the required answers, ask these only if relevant:

7. **Do you have a brand voice guide?** — File path or description. If yes, integrate. If no, default to direct/confident.
8. **Do you have testimonials or proof?** — Specific results, case studies, logos, numbers. Real proof dramatically improves Section 5.
9. **Where is traffic coming from?** — Cold (ads), warm (email list), hot (referral). This changes how much context the Hero needs.

---

## Brand Voice Integration

Before generating copy, search for an existing brand voice guide:

1. Check for `brand-voice.md` in the project using Glob: `**/brand-voice.md`
2. If found, read it and apply voice patterns to all copy output
3. If not found, default to: direct, confident, second-person ("you"), short sentences, no jargon, active voice

**The integration rule:** Brand voice wins on connective tissue — transitions, tone words, personality flourishes. Conversion architecture wins on structural elements — headlines, CTAs, value stacks, problem statements. Never sacrifice clarity for voice. Never sacrifice voice for bland.

---

## Section Architecture

Eight sections. Fixed sequence. Each has a job. Skip nothing except Section 2 (conditional).

---

### Section 1: HERO

**Job: Get email or get scroll.**

#### Position Psychology

First impression. You have 3-7 seconds before the visitor decides: engage or bounce. The Hero doesn't sell — it earns permission to keep talking. Every element exists to drive one of two outcomes: they take the primary action immediately (sophisticated buyers who already know) or they scroll to learn more (everyone else).

#### Formula: AIDA Opening (Attention-Interest)

Grab attention with a specific, outcome-driven headline. Build interest with a subheadline that expands the promise. Direct action with one unmissable CTA.

#### Components

**Eyebrow** (optional, above headline)
- Short categorization or credibility signal
- Good: `"Trusted by 2,400+ marketing teams"` — specific, provable
- Bad: `"The #1 Solution"` — unverifiable, generic
- Rule: If you can't make it specific, cut it entirely

**Headline**
- One clear promise. One transformation. No cleverness at the expense of clarity.
- Good: `"Turn cold traffic into booked calls in 14 days"` — specific outcome, specific timeframe
- Bad: `"Revolutionize Your Marketing with AI-Powered Solutions"` — buzzwords, no specificity
- Why the bad version fails: "Revolutionize" is empty. "AI-Powered" is a feature, not an outcome. "Solutions" means nothing. The reader learns zero about what happens after they buy.
- Rule: The headline should pass the "stranger test" — would someone with no context understand what you sell and why they should care?

**Subheadline**
- Expands the headline. Adds the HOW or the WHO without repeating.
- Good: `"The outbound system that books 15+ demos/month — without cold calling or expensive ads"` — adds mechanism, removes objections
- Bad: `"Our comprehensive platform helps businesses grow"` — could describe any company on earth
- Rule: Subheadline answers the question the headline creates

**Primary CTA**
- One button. One action. Verb + outcome format.
- Good: `"Start my free trial"` — first person, action, benefit
- Good: `"Get the playbook free"` — action, object, qualifier
- Bad: `"Submit"` — tells the visitor nothing
- Bad: `"Learn More"` — passive, vague, delays commitment
- Rule: The CTA should complete the sentence "I want to ___"

**Trust Signals** (below CTA)
- Micro-proof that reduces risk of clicking
- Good: `"No credit card required · 14-day free trial · Cancel anytime"`
- Good: `"Join 2,400+ teams"` + 3-4 recognizable logos
- Bad: `"We're the best in the industry"`
- Rule: Trust signals answer "What's the catch?" before the visitor asks

#### Copy Guidance

> **Good Hero (SaaS example):**
>
> *Eyebrow:* Trusted by 2,400+ B2B sales teams
>
> *Headline:* Turn cold traffic into booked calls in 14 days
>
> *Subheadline:* The outbound system that books 15+ demos per month — without cold calling, expensive ads, or hiring SDRs.
>
> *CTA:* Start my free trial
>
> *Trust:* No credit card required · Setup in 5 minutes · Cancel anytime

> **Bad Hero (same product):**
>
> *Headline:* The Future of Sales Engagement
>
> *Subheadline:* Our AI-powered platform leverages cutting-edge technology to help your team achieve more.
>
> *CTA:* Learn More
>
> Why it fails: Zero specificity. "Future of" is a cliche. "Leverages cutting-edge technology" is filler. "Achieve more" — more what? The CTA delays action instead of inviting it.

#### Code Notes

```
<section id="hero" aria-label="Main offer">
```
- Semantic: `<section>` with landmark label, `<h1>` for headline (only `<h1>` on the page)
- Layout: Centered single-column or split (content left, visual right). Max-width 640px for text content.
- Responsive: Stack to single column on mobile. CTA must be thumb-reachable (min 48px tap target).
- CSS: Hero should fill viewport height on desktop (`min-height: 100vh` or `100dvh`). Use CSS custom properties for brand colors: `var(--color-primary)`, `var(--color-cta)`.

---

### Section 2: SUCCESS (Conditional)

**Job: Kill buyer's remorse.**

#### Position Psychology

This section appears ONLY after the visitor has completed the primary action (form submit, purchase). It confirms their decision was smart and tells them exactly what happens next. Uncertainty after action creates regret. Clarity after action creates confidence — and confident buyers refer others, open emails, and don't request refunds.

#### Formula: Confirmation + Next Steps

Validate the decision. Deliver immediate value. Set expectations for what comes next.

#### Components

**Checkmark / Confirmation Icon**
- Visual confirmation that the action succeeded
- Good: Green checkmark with `"You're in!"` or `"Welcome aboard"`
- Bad: No visual feedback, just a text paragraph
- Rule: The confirmation must be instantly visible — no scrolling to find it

**Confirmation Message**
- Reinforce the value of their decision, not just the mechanics
- Good: `"Great move. Your free trial is live — here's what happens in the next 60 seconds."`
- Bad: `"Thank you for submitting your information. A representative will be in touch."`
- Why the bad version fails: "Submitting your information" frames the visitor as giving something up. "A representative will be in touch" is vague and sounds like a sales trap.
- Rule: Confirmation should make them feel smart, not processed

**Deliverable List**
- Concrete, specific things they will receive and when
- Good: `"✓ Login credentials (check your inbox now) · ✓ 5-minute quickstart video · ✓ Template library unlocked"`
- Bad: `"You will receive an email shortly."`
- Rule: List 3 specific deliverables. Specificity kills doubt.

#### Copy Guidance

> **Good Success (SaaS example):**
>
> *Icon:* ✓
>
> *Headline:* You're in. Your trial is live.
>
> *Body:* Check your inbox for login credentials. While you wait, here's what's unlocked:
>
> *List:* ✓ Dashboard access (instant) · ✓ 5-minute quickstart video · ✓ 12 proven outreach templates · ✓ Live chat support
>
> *Next step:* Open your welcome email and click "Launch Dashboard" to get started now.

> **Bad Success:**
>
> *Headline:* Thank You
>
> *Body:* Your submission has been received. We will review your request and get back to you within 2-3 business days.
>
> Why it fails: "Thank You" is generic. "Submission" and "request" are bureaucratic. "2-3 business days" creates anxiety. No deliverables listed, nothing to do next.

#### Code Notes

```
<section id="success" aria-label="Confirmation" role="status">
```
- Semantic: `role="status"` for screen reader announcement. Hidden by default, shown via state change (CSS class toggle or JS).
- Layout: Centered card, max-width 560px. Generous padding. Checkmark icon prominent at top.
- Responsive: Works at any width — single column, no complex layout.
- CSS: Background should contrast with hero (light card on dark bg or vice versa). Use `animation: fadeIn` for the reveal. Keep JS minimal — a class toggle to show/hide is sufficient.
- Important: This section replaces or overlays the hero form. Do NOT redirect to a separate page unless required by payment processor.

---

### Section 3: PROBLEM-AGITATE

**Job: Make status quo painful.**

#### Position Psychology

After the Hero earns the scroll, the visitor is curious but not committed. Section 3 meets them in their current pain. It says "I understand your problem better than you do." This builds trust (they feel seen) and urgency (they realize the cost of inaction). You must agitate BEFORE presenting the solution — a doctor who prescribes before diagnosing isn't trusted.

#### Formula: PAS (Problem-Agitate-Solve preview)

Name 3 specific problems. Agitate each by showing the hidden cost or downstream consequence. Transition with a personal bridge: "I built this because I lived this."

#### Components

**3 Problems with Agitations**
- Each problem is a pair: the surface symptom + the deeper cost
- Good:
  - Problem: `"You're spending 4 hours/day on manual outreach"`
  - Agitation: `"That's 1,000 hours/year you could spend closing — not prospecting"`
- Bad:
  - Problem: `"Sales is hard"`
  - Agitation: `"It doesn't have to be"`
- Why the bad version fails: "Sales is hard" is obvious — the reader already knows this. It doesn't demonstrate understanding. The agitation offers no new insight.
- Rule: Problems should be specific enough that the reader thinks "How did they know?" Agitations should quantify the cost — time, money, opportunity, or emotional toll.

**Personal Transition**
- Bridge from "I understand your pain" to "here's what I built"
- Good: `"After burning $40K on agencies that couldn't book a single call, I built the system I wished existed."`
- Bad: `"We created an innovative solution to solve this problem."`
- Rule: The transition earns permission to sell. Without it, the value stack feels like a pitch. With it, the value stack feels like a gift.

#### Copy Guidance

> **Good Problem-Agitate (SaaS example):**
>
> *Headline:* Sound familiar?
>
> *Problem 1:* You're writing 50 cold emails a day and hearing nothing but crickets.
> *Agitation:* That's 250 hours/year of your best sellers doing work a system should handle.
>
> *Problem 2:* You've tried 3 outbound tools and none of them integrated with your actual workflow.
> *Agitation:* So your team built workarounds on top of workarounds — and now nobody trusts the data.
>
> *Problem 3:* Your pipeline looks full on paper but half those "leads" will never respond.
> *Agitation:* You're forecasting on fiction. And your board is starting to notice.
>
> *Transition:* We spent 18 months in the same trap. Then we built the system that got us out.

> **Bad Problem-Agitate:**
>
> *Headline:* Challenges in Modern Sales
>
> *Problem 1:* Many companies struggle with outreach.
> *Problem 2:* Integration can be difficult.
> *Problem 3:* Lead quality is important.
>
> Why it fails: No specificity. No agitation. No emotional resonance. "Many companies" is not "you." This reads like a textbook, not a mirror.

#### Code Notes

```
<section id="problem" aria-labelledby="problem-heading">
```
- Semantic: `<h2>` for section heading. Each problem as a `<div>` or `<article>` with heading + paragraph pair.
- Layout: 3-column grid on desktop, single-column stack on mobile. Each problem card should feel distinct but visually connected.
- Responsive: Cards stack vertically on mobile. Transition paragraph spans full width below the cards.
- CSS: Subtle background shift from hero (slightly different shade or texture). Problem cards benefit from a left border accent or icon to create visual rhythm. Transition paragraph often uses slightly larger/italic text to signal the shift in voice.

---

### Section 4: VALUE STACK

**Job: Make saying no feel stupid.**

#### Position Psychology

Now that the visitor feels the pain (Section 3), they're ready to hear the solution — but not as a feature list. The value stack presents the offer as layers of value, each one making the deal feel more lopsided in the buyer's favor. The total perceived value must be 5-10x the asking price. When the buyer sees the real price, the gap between perceived value and actual cost should create a "no-brainer" reaction.

#### Formula: Value Stacking + Price Anchoring

List 4 tiers of value, descending from most expensive/impressive to most accessible. Show a total perceived value. Reveal the actual price. The contrast does the selling.

#### Components

**4 Value Tiers (Descending)**
- Each tier: name, description, perceived value
- Good:
  - Tier 1: `"Done-for-you outreach sequences (Value: $3,000)"` — the premium, high-effort deliverable
  - Tier 2: `"12 proven email templates (Value: $997)"` — the reusable asset
  - Tier 3: `"CRM integration setup guide (Value: $497)"` — the implementation support
  - Tier 4: `"Private community access (Value: $297)"` — the ongoing resource
- Bad:
  - `"Feature 1: Email sending"`
  - `"Feature 2: Analytics"`
  - `"Feature 3: Dashboard"`
- Why the bad version fails: Features describe what the product DOES. Value stacking describes what the buyer GETS. Nobody pays for a dashboard — they pay for the insight it gives them.
- Rule: Each tier should be something the buyer could purchase separately. The perceived value must be defensible, not inflated.

**Total Value**
- Good: `"Total value: $4,791"`
- Rule: Sum the individual tier values. This number anchors the price comparison.

**Your Price**
- Good: `"Your investment today: $297"` — 16:1 value ratio
- Good: `"Start free for 14 days, then $49/mo"` — removes price risk entirely
- Bad: `"Contact us for pricing"` — kills momentum, adds friction
- Rule: The price reveal should feel like relief after the value stack. If your price requires a sales call, the landing page should sell the call, not the product.

#### Copy Guidance

> **Good Value Stack (SaaS example):**
>
> *Headline:* Everything you need to book 15+ demos/month
>
> *Tier 1:* Done-for-you outreach sequences — tested across 2,400 accounts *(Value: $3,000)*
> *Tier 2:* 12 proven cold email templates with 40%+ open rates *(Value: $997)*
> *Tier 3:* One-click CRM integration for Salesforce, HubSpot, and Pipedrive *(Value: $497)*
> *Tier 4:* Access to our private Slack community of 800+ outbound operators *(Value: $297)*
>
> *Total:* $4,791 in value
> *Price:* Start free for 14 days. Then $49/month. Cancel anytime.

> **Bad Value Stack:**
>
> *Headline:* Features
>
> *List:* Email sending · Analytics · Dashboard · Integrations
>
> *Price:* See pricing page
>
> Why it fails: "Features" is a label, not a headline. The list is a spec sheet, not a value proposition. "See pricing page" adds a click and breaks momentum.

#### Code Notes

```
<section id="value" aria-labelledby="value-heading">
```
- Semantic: `<h2>` heading. Value tiers as an ordered list (`<ol>`) or stacked `<div>`s. Use `<del>` for struck-through total value and `<ins>` or `<strong>` for actual price.
- Layout: Single column, stacked tiers with visual hierarchy (tier 1 largest/most prominent). Price reveal at bottom with strong visual contrast.
- Responsive: Stacks naturally — this section is inherently vertical.
- CSS: Each tier should have a subtle separator. The price reveal benefits from a background color shift or card treatment to draw the eye. Strike-through on total value uses `text-decoration: line-through` with reduced opacity. Actual price in bold, larger font, brand accent color.

---

### Section 5: SOCIAL PROOF

**Job: Let others convince them.**

#### Position Psychology

The visitor has seen the promise (Hero), felt the pain (Problem), and understood the value (Stack). Now doubt creeps in: "But will it work for ME?" Section 5 answers with proof from people like them. Third-party validation is more persuasive than any claim you can make about yourself. Position proof AFTER the value stack so testimonials validate the value, not replace it.

#### Formula: Specificity + Relatability

Each testimonial must include a specific result and enough context for the reader to self-identify. Vague praise ("Great product!") is noise. Specific outcomes ("Booked 23 demos in our first month") are proof.

#### Components

**Section Header**
- Frame the proof, don't just label it
- Good: `"2,400+ teams. Here's what they're saying."`
- Bad: `"Testimonials"`
- Rule: The header should reinforce the scale of adoption

**3 Testimonials with Specific Results**
- Each testimonial needs: quote with specific outcome, name, title/company, photo (if available)
- Good: `"We went from 3 demos/month to 19 in our first 6 weeks. Our pipeline has never been healthier." — Sarah Chen, VP Sales, Meridian SaaS`
- Bad: `"Great tool! Really helped our team." — John D.`
- Why the bad version fails: No specific result. No full name or real company. No detail the reader can anchor to. This could be fabricated — and the reader assumes it is.
- Rule: Every testimonial must include a number, a timeframe, or a specific before/after. "Helped our team" is not proof. "Cut our outreach time by 60%" is proof.

#### Copy Guidance

> **Good Social Proof (SaaS example):**
>
> *Header:* Don't take our word for it. Take theirs.
>
> *Testimonial 1:*
> "We went from 3 demos/month to 19 in our first 6 weeks. The sequences practically write themselves."
> — Sarah Chen, VP Sales, Meridian SaaS (Series B, 45 employees)
>
> *Testimonial 2:*
> "I canceled $2,100/month in tools we no longer need. This replaced three platforms on day one."
> — Marcus Webb, Revenue Operations, CloudKitchen
>
> *Testimonial 3:*
> "Our SDR team went from spending 4 hours/day prospecting to 45 minutes. They actually like their jobs now."
> — Priya Kapoor, Head of Growth, FinLeap

> **Bad Social Proof:**
>
> *Header:* What Our Customers Say
>
> *Testimonial 1:* "Great product!" — J.D.
> *Testimonial 2:* "Really helpful tool." — Anonymous
> *Testimonial 3:* "Would recommend." — A Customer
>
> Why it fails: No specificity. No real names. No results. This actually hurts credibility — it signals that you either have no real customers or no real results to share.

#### Code Notes

```
<section id="proof" aria-labelledby="proof-heading">
```
- Semantic: `<h2>` heading. Each testimonial in a `<blockquote>` with `<cite>` for attribution. If photos are used, include descriptive `alt` text.
- Layout: 3-column grid on desktop, carousel or stack on mobile. Each testimonial card should have consistent height (use `align-items: stretch` in grid).
- Responsive: Stack to single column on mobile. If using a carousel, ensure keyboard navigation and touch swipe support.
- CSS: Testimonial cards benefit from a subtle quote mark decoration (CSS `::before` pseudo-element with a large typographic quotation mark). Photos should be circular (`border-radius: 50%`), 48-64px. Star ratings, if used, should be decorative (not interactive).

---

### Section 6: TRANSFORMATIVE

**Job: Make outcome tangible.**

#### Position Psychology

Proof showed that OTHERS got results. Section 6 makes the buyer see THEMSELVES getting results — and not just the immediate outcome, but the compounding transformation over time. This is future pacing: you're helping the buyer emotionally experience the after-state before they buy. This section often pushes fence-sitters over the edge because it shifts the frame from "Am I willing to pay?" to "Am I willing to miss out?"

#### Formula: Future Pacing + Milestone Progression

Present the transformation as 4 escalating stages that build on each other. Start with the quick win (reduces risk perception) and end with the aspirational outcome (increases desire). Each stage should be specific and time-bound.

#### Components

**4 Transformation Stages**

- **Stage 1: Quick Win** — What happens in the first 24-48 hours
  - Good: `"Day 1: Your first automated sequence goes live. You send 50 personalized emails without writing a single one."`
  - Bad: `"Get started quickly"`
  - Rule: The quick win must be achievable without expertise. It proves the product works.

- **Stage 2: Compound** — What happens in the first 2-4 weeks
  - Good: `"Week 2: Replies start flowing in. Your calendar has 3-5 qualified demos booked — automatically."`
  - Bad: `"See results over time"`
  - Rule: The compound stage shows momentum. Results are building, not just starting.

- **Stage 3: Advantage** — What happens in 1-3 months
  - Good: `"Month 2: Your pipeline is 3x what it was. Your team focuses on closing, not chasing. Your competitors are still writing cold emails by hand."`
  - Bad: `"Grow your business"`
  - Rule: The advantage stage introduces competitive contrast. You're not just better off — you're ahead.

- **Stage 4: 10x** — The aspirational long-term outcome
  - Good: `"Month 6: You've scaled outbound across 3 markets without adding headcount. Your CAC dropped 40%. The board is smiling."`
  - Bad: `"Achieve your goals"`
  - Rule: The 10x stage should feel ambitious but plausible given the earlier stages. It's the "imagine if" close.

#### Copy Guidance

> **Good Transformative (SaaS example):**
>
> *Headline:* Here's what the next 6 months look like
>
> *Stage 1 — Quick Win:*
> Day 1: Launch your first automated sequence. 50 personalized outbound emails go out while you finish your coffee.
>
> *Stage 2 — Compound:*
> Week 3: Your reply rate hits 12%. You have 8 demos on the calendar this week — without a single cold call.
>
> *Stage 3 — Advantage:*
> Month 2: Pipeline is 3x last quarter. Your SDR team went from burned out to bought in. Competitors are still doing it the old way.
>
> *Stage 4 — 10x:*
> Month 6: You've expanded to 3 new markets with the same team size. CAC dropped 40%. Revenue per rep doubled.

> **Bad Transformative:**
>
> *Headline:* Benefits
>
> *List:*
> - Save time
> - Increase revenue
> - Scale your team
>
> Why it fails: No progression, no timeline, no specificity. "Save time" could mean 5 minutes or 5 hours. These are features disguised as benefits. The reader can't emotionally experience any of them.

#### Code Notes

```
<section id="transformation" aria-labelledby="transform-heading">
```
- Semantic: `<h2>` heading. Stages as an `<ol>` (they are sequential). Each stage with a sub-heading (`<h3>`) and paragraph.
- Layout: Vertical timeline on desktop (stages stacked with a visual connecting line). Horizontal scrolling timeline alternative for more visual brands.
- Responsive: Timeline connector adapts — vertical line on all screen sizes works best. Horizontal timeline collapses to vertical on mobile.
- CSS: Timeline uses a CSS `::before` pseudo-element on the container with `border-left: 2px solid var(--color-accent)`. Each stage has a circular marker positioned on the line. Progressive visual treatment: Stage 1 subtle, Stage 4 bold/highlighted to show escalation.

---

### Section 7: SECONDARY CTA

**Job: Catch the scrollers.**

#### Position Psychology

Some visitors scroll past the Hero CTA because they needed more information. They've now read the problem, value, proof, and transformation. They're warm — maybe hot. This section catches them before they reach the footer and leave. The secondary CTA is not a repeat of the Hero — it uses social pressure and an assumptive close to convert the "almost ready" visitor. This is your last persuasive section.

#### Formula: Assumptive Close + Social Pressure

Frame the CTA as a "yes" decision rather than a "should I?" decision. Add social proof elements (avatar stack, counter) to trigger belonging instinct. Use a question headline that presupposes the answer.

#### Components

**Avatar Stack**
- Visual cluster of real or representative user photos showing community
- Good: 5-8 overlapping circular avatars with a `"+2,400 others"` counter
- Bad: Stock photo grid of smiling models
- Rule: Avatar stacks signal "people like you already did this." The number should be real. Overlapping layout creates visual density — feels like a crowd.

**Question Headline**
- Presupposes the decision. Frames the CTA as confirming what they already want.
- Good: `"Ready to stop writing cold emails and start booking demos?"`
- Bad: `"Interested in trying our product?"`
- Why the bad version fails: "Interested" is lukewarm. "Trying" implies tentative commitment. The good version presupposes desire and frames the CTA as the relief.
- Rule: The question should contrast the pain (status quo) with the promise (transformation), and the answer should be obviously "yes."

**"Yes" Button**
- CTA text that lets the visitor say "yes" to the question headline
- Good: `"Yes, start my free trial"` — affirms the decision, first person
- Good: `"Book my demo now"` — specific, urgent, personal
- Bad: `"Sign Up"` — generic, impersonal
- Rule: The button should read as a natural response to the question. Question: "Ready to X?" Button: "Yes, X."

#### Copy Guidance

> **Good Secondary CTA (SaaS example):**
>
> *Avatar stack:* [5 photos] + "Join 2,400+ sales teams already using this"
>
> *Headline:* Ready to stop chasing leads and start closing deals?
>
> *CTA:* Yes, start my free trial
>
> *Sub-CTA text:* No credit card. No commitment. 14 days free.

> **Bad Secondary CTA:**
>
> *Headline:* Sign Up Today
>
> *CTA:* Submit
>
> Why it fails: "Sign Up Today" is a command, not a question. There's no social proof, no restatement of value, no risk reduction. "Submit" as CTA text is the conversion kiss of death — it frames the visitor as surrendering something.

#### Code Notes

```
<section id="cta-secondary" aria-labelledby="cta2-heading">
```
- Semantic: `<h2>` heading. CTA as `<a>` (if navigating) or `<button>` (if triggering action). Avatar stack as a list of `<img>` elements.
- Layout: Centered, narrow section. Avatar stack above headline above CTA. Generous vertical padding to create visual breathing room.
- Responsive: Stacks naturally. CTA button should be full-width on mobile for easy tapping (min 48px height).
- CSS: Background shift from previous section — this should feel like a distinct moment. Often a darker background with lighter text to create urgency contrast. Avatar images overlap with negative `margin-left` and stacking via `z-index`. CTA button benefits from a subtle `box-shadow` or `transform: scale()` hover effect to feel interactive.

---

### Section 8: FOOTER

**Job: Professional legitimacy.**

#### Position Psychology

The footer isn't persuasive — it's reassuring. A missing or sloppy footer signals "fly-by-night." A clean footer signals "established business." Some visitors scroll to the footer first to check if a company is real. Give them what they need: brand mark, navigation, legal, and social links. Nothing more.

#### Formula: Trust Architecture

Minimal, professional, complete. The footer proves you're a real business with real legal standing and real social presence.

#### Components

**Logo**
- Brand mark (not full logo if space-constrained)
- Rule: Smaller than the header logo. Not a CTA — just a brand anchor.

**Navigation**
- Core links: Product, Pricing, About, Contact, Blog (if applicable)
- Good: 4-8 links organized in 2-3 columns
- Bad: 30+ links in a mega-footer (this is a landing page, not a corporate site)
- Rule: Landing page footers should be sparse. Every link is a potential exit. Include only what's necessary for legitimacy.

**Legal**
- Privacy Policy, Terms of Service, Copyright notice
- Good: `"© 2025 Acme Inc. · Privacy · Terms"`
- Rule: Legal links are non-negotiable. Absence signals shadiness, especially for pages collecting email or payment.

**Social Links**
- Platform icons linking to active profiles
- Good: 2-4 platforms where you're actually active
- Bad: 8 social icons, 5 of which link to inactive profiles
- Rule: Only link to profiles you update regularly. Dead social profiles are worse than no social profiles.

#### Copy Guidance

> **Good Footer (SaaS example):**
>
> *Logo:* [Acme wordmark]
>
> *Nav:* Product · Pricing · About · Blog · Contact
>
> *Legal:* © 2025 Acme Inc. · Privacy Policy · Terms of Service
>
> *Social:* LinkedIn · Twitter/X

> **Bad Footer:**
>
> *[No footer at all]*
>
> Why it fails: No footer = no legitimacy. The visitor wonders: Is this a real company? Who am I giving my email/money to? Can I contact them if something goes wrong?

#### Code Notes

```
<footer id="footer" aria-label="Site footer">
```
- Semantic: `<footer>` element (landmark). Navigation in `<nav>`. Legal as a `<small>` element. Social links with `aria-label` on each (e.g., `aria-label="Follow us on LinkedIn"`).
- Layout: Multi-column on desktop (logo left, nav center, social right). Single-column stack on mobile.
- Responsive: Collapses to centered single column on mobile.
- CSS: Subtle top border or background color shift to delineate from content. Reduced font size (14px). Muted colors — the footer should recede visually, not compete with content above.

---

## Output Format Templates

Ask the user which format they need. If not specified, default to Format C (Combined).

### Format A: Copy Only

Output structured markdown with clear section headers, ready for a designer or developer to implement.

```markdown
# LANDING PAGE COPY: [Product/Offer Name]

*Target audience: [Audience from discovery]*
*Primary action: [CTA from discovery]*

---

## SECTION 1: HERO

**Eyebrow:** [text]
**Headline:** [text]
**Subheadline:** [text]
**CTA Button:** [text]
**Trust Line:** [text]

---

## SECTION 3: PROBLEM-AGITATE

**Headline:** [text]

**Problem 1:** [text]
**Agitation 1:** [text]

**Problem 2:** [text]
**Agitation 2:** [text]

**Problem 3:** [text]
**Agitation 3:** [text]

**Transition:** [text]

---

[Continue for all applicable sections...]
```

### Format B: Code Only

Output a single HTML file with embedded CSS. Semantic sections, CSS custom properties, responsive by default. No external dependencies. No JavaScript required for content (JS only for form handling if needed).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Page Title] — [Brand]</title>
  <style>
    :root {
      --color-bg: #ffffff;
      --color-text: #1a1a1a;
      --color-primary: #2563eb;
      --color-cta: #2563eb;
      --color-cta-text: #ffffff;
      --color-muted: #6b7280;
      --color-surface: #f9fafb;
      --color-border: #e5e7eb;
      --font-heading: system-ui, sans-serif;
      --font-body: system-ui, sans-serif;
      --max-width: 1120px;
      --section-padding: 5rem 1.5rem;
    }
    /* Reset, typography, sections, responsive breakpoints */
  </style>
</head>
<body>
  <section id="hero">...</section>
  <section id="problem">...</section>
  <section id="value">...</section>
  <section id="proof">...</section>
  <section id="transformation">...</section>
  <section id="cta-secondary">...</section>
  <footer id="footer">...</footer>
</body>
</html>
```

**Code rules:**
- All CSS custom properties defined in `:root`
- Mobile-first responsive (`min-width` media queries)
- `<h1>` used once (Hero headline only), `<h2>` for all section headings
- WCAG AA contrast ratios on all text
- No framework dependencies — vanilla HTML/CSS
- Images referenced but not embedded (use placeholder `alt` text descriptions)

### Format C: Combined (Default)

1. Generate all copy first (Format A) and present for review
2. Ask: `"Copy approved? I'll build the page next. Any changes first?"`
3. After approval, generate full HTML (Format B) with the approved copy inserted
4. Apply `frontend-design.md` aesthetic principles if that skill is available

---

## Anti-Patterns

### Copy Anti-Patterns — NEVER do these

- **NEVER lead with features.** Features belong in the value stack, not the hero. Lead with outcomes.
- **NEVER use "Submit" as CTA text.** It frames the visitor as surrendering. Use verb + outcome: "Get," "Start," "Join," "Book."
- **NEVER use "Welcome to [Company]" as a headline.** Nobody cares about your welcome. They care about their problem.
- **NEVER use "Learn More" as a primary CTA.** It delays commitment and signals you're not confident enough to ask for the real action.
- **NEVER write testimonials without specific results.** "Great product" is not social proof. Numbers, timeframes, and before/after are proof.
- **NEVER use "we" more than "you."** The visitor is the hero, not you. Aim for 3:1 you-to-we ratio minimum.
- **NEVER use jargon in headlines.** If your mother wouldn't understand it, rewrite it. Jargon is acceptable only in deep-feature sections for technical audiences.
- **NEVER use passive voice in CTAs.** "Your trial will be started" vs. "Start your free trial" — active voice converts higher, always.

### Architecture Anti-Patterns — NEVER do these

- **NEVER reorder the sections.** The sequence is the persuasion logic. Hero > Problem > Value > Proof > Transform > CTA is a psychological progression, not a suggestion.
- **NEVER skip Problem-Agitate.** Without establishing pain, your value stack is a feature list nobody cares about. Pain creates the context for value.
- **NEVER put Social Proof before Value Stack.** Testimonials validate value — they can't replace it. Show the offer, THEN prove it works.
- **NEVER add a second primary CTA competing with the first.** One page, one action. Secondary CTAs support the primary action; they don't introduce a new one.
- **NEVER insert a navigation bar that links away from the page.** Landing pages are single-purpose. A nav bar with "Blog" and "About" is an exit ramp. Footer nav is sufficient.

### Code Anti-Patterns — NEVER do these

- **NEVER require JavaScript for content to be visible.** Every section must render with JS disabled. JS is for enhancement (animations, form validation), not content delivery.
- **NEVER auto-play video with sound.** Auto-play muted is acceptable. Auto-play with sound triggers immediate page abandonment.
- **NEVER use a carousel for testimonials on desktop.** Show all 3. Carousels hide content behind interaction. Hidden content doesn't convert.
- **NEVER use custom fonts without fallbacks.** Always include a system font fallback: `font-family: 'Custom Font', system-ui, sans-serif`.
- **NEVER set fixed heights on text containers.** Content varies. Use `min-height` if vertical rhythm matters, but never `height` — it causes overflow on mobile and with dynamic content.

---

## Quality Checklist

Run this checklist before delivering any landing page output.

### Conversion Architecture

- [ ] All 8 sections present (Section 2 conditionally)
- [ ] Sections follow the prescribed order — no reordering
- [ ] Every section can state its job in one sentence
- [ ] Each section pre-sells the next (Hero earns scroll, Problem earns listen, etc.)
- [ ] One primary CTA, one primary action throughout the page
- [ ] No competing calls-to-action or exit links above the footer

### Copy Quality

- [ ] **Stranger Test** — Would someone with zero context understand the offer from the hero alone?
- [ ] **You:We Ratio** — At least 3:1 "you/your" to "we/our" across the page
- [ ] **Specificity** — Every claim includes a number, timeframe, or concrete detail
- [ ] **Active Voice** — 90%+ of sentences use active construction
- [ ] **CTA Clarity** — Every button completes the sentence "I want to ___"
- [ ] **Problem Resonance** — Problems are specific enough that the target audience thinks "How did they know?"
- [ ] **Value Stack Math** — Perceived value is 5-10x the asking price
- [ ] **Testimonial Proof** — Every testimonial includes a specific, quantified result

### Code Quality

- [ ] **Heading Hierarchy** — Single `<h1>`, sequential `<h2>`s, no skipped levels
- [ ] **WCAG AA Contrast** — All text meets 4.5:1 contrast ratio (3:1 for large text)
- [ ] **Mobile Responsive** — All sections render correctly at 320px width
- [ ] **Tap Targets** — All interactive elements are minimum 48x48px on mobile
- [ ] **Semantic HTML** — Proper use of `<section>`, `<footer>`, `<nav>`, `<blockquote>`, `<cite>`
- [ ] **No JS Content Dependency** — All content visible with JavaScript disabled
- [ ] **CSS Custom Properties** — Colors, fonts, and spacing use `:root` variables
- [ ] **System Font Fallbacks** — Every `font-family` declaration includes a fallback

### Brand Alignment

- [ ] Voice guide consulted and applied (if one exists)
- [ ] Tone is consistent across all sections
- [ ] Brand personality shows in transitions and connective copy
- [ ] Visual style matches brand identity (if guidelines exist)
- [ ] CTA language matches brand voice (formal vs. casual)

---

## Philosophy

Design the page to be beautiful. Write the copy to convert. When those two goals conflict, conversion wins.

A landing page is not a brochure. It is not a homepage. It is a single-purpose persuasion machine with one job: move the visitor from curiosity to action. Every section, every sentence, every pixel serves that job — or it gets cut.

The architecture is the argument. Trust the sequence.
