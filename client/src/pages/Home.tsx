import { Link } from "react-router-dom";
import { orgPath, useOrgs } from "../orgs";

const publicLinks = [
  { to: "/reviews", title: "Curriculum Reviews", blurb: "Compare publishers and read verified scores." },
  { to: "/share", title: "Share Resources", blurb: "Gift kits, décor, and supplies to other churches." },
  { to: "/setup", title: "Show Your Setup", blurb: "Photos and notes from your VBS rooms." },
  { to: "/messages", title: "Direct Message", blurb: "Reach teammates in your org or site-wide." },
  { to: "/about", title: "About", blurb: "What EklosHub is for and how to use it." },
];

export default function HomePage() {
  const { tenantId } = useOrgs();
  const orgHub = orgPath(tenantId, "");
  const orgPlan = orgPath(tenantId, "/vbs-plan");
  const orgReg = orgPath(tenantId, "/registration");

  return (
    <div className="empty-main">
      <header className="landing-hero">
        <p className="eyebrow">EklosHub</p>
        <h1>Plan, register, and run VBS in one place</h1>
        <p className="tagline">
          Use the rail for public tools and curriculum research. Open your organization at Director home to plan the
          week, build teams, and run registration.
        </p>
      </header>

      <h2 className="vbs-plan-sections-title">Public</h2>
      <ul className="landing-grid">
        {publicLinks.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="landing-card">
              <strong>{item.title}</strong>
              <span>{item.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>

      {tenantId ? (
        <>
          <h2 className="vbs-plan-sections-title landing-section-title">
            Your organization
          </h2>
          <ul className="landing-grid">
            <li>
              <Link to={orgHub} className="landing-card">
                <strong>Director home</strong>
                <span>Checklist, needs attention, and links to plan, teams, and registration.</span>
              </Link>
            </li>
            <li>
              <Link to={orgPlan} className="landing-card">
                <strong>VBS plan</strong>
                <span>Week schedule, team tasks, prep milestones, stations, and board.</span>
              </Link>
            </li>
            <li>
              <Link to={orgReg} className="landing-card">
                <strong>Registration</strong>
                <span>Staff-first student entry, classes, allergies, optional parent link.</span>
              </Link>
            </li>
            <li>
              <Link to={orgPath(tenantId, "/cooking-plan")} className="landing-card">
                <strong>Cooking plan</strong>
                <span>Menus, allergies tree, and snack rotation helpers.</span>
              </Link>
            </li>
          </ul>
        </>
      ) : (
        <p className="muted landing-section-foot">
          Expand an organization in the left rail to jump to plan and registration tools.
        </p>
      )}
    </div>
  );
}
