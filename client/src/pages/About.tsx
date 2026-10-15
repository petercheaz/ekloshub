export default function AboutPage() {
  return (
    <article className="about">
      <header className="page-head">
        <p className="eyebrow">VBS Resources</p>
        <h1>About</h1>
        <p className="tagline">
          Free tools for churches to research curriculum, share supplies, and coordinate Vacation Bible School.
        </p>
      </header>
      <section className="vbs-panel about-block">
        <p className="about-lead">
          We help teams review and compare VBS curriculum, get room and setup inspiration, trade or share leftover
          kits and décor, and stay connected through direct messages and org workspaces.
        </p>
      </section>
      <section className="vbs-panel about-block">
        <h2 className="vbs-plan-section-title">Where to start</h2>
        <p className="muted vbs-plan-section-lead about-start">
          <strong className="about-em">Curriculum Reviews</strong> — filter by year and publisher, expand reviews for
          scores and notes. <strong className="about-em">Share VBS Resources</strong> — post what you can give away.
          Create or join an organization for room design, the VBS plan, registration, and cooking tools scoped to your
          church.
        </p>
      </section>
    </article>
  );
}
