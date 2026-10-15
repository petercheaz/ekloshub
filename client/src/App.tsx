import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./Layout";
import AboutPage from "./pages/About";
import CreateOrgPage from "./pages/CreateOrg";
import HomePage from "./pages/Home";
import InvitePage from "./pages/Invite";
import LoginPage from "./pages/Login";
import ManageTeamsPage from "./pages/ManageTeams";
import MessagesPage from "./pages/Messages";
import OrgDirectorHubPage from "./pages/OrgDirectorHub";
import OrgHomePage from "./pages/OrgHome";
import ReviewsPage from "./pages/Reviews";
import RoomIdeasPage from "./pages/RoomIdeas";
import PhotoshoppeLitePage from "./pages/PhotoshoppeLite";
import OrgContactPage from "./pages/OrgContact";
import ProfilePage from "./pages/Profile";
import VbsPlanPage from "./pages/VbsPlan";
import VbsRegistrationPage from "./pages/VbsRegistration";
import CookingPlanPage from "./pages/CookingPlanPage";
import ParentRegisterPage, { ParentFamilyPage } from "./pages/ParentRegister";
import OrgVolunteerPage from "./pages/OrgVolunteerPage";
import OrgVolunteerCompliancePage from "./pages/OrgVolunteerCompliance";
import SharePage from "./pages/Share";
import SetupPage from "./pages/Setup";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/register/:token" element={<ParentRegisterPage />} />
      <Route path="/family/:token" element={<ParentFamilyPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/org/new" element={<CreateOrgPage />} />
        <Route path="/org/:orgId" element={<OrgDirectorHubPage />} />
        <Route path="/org/:orgId/my-week" element={<OrgVolunteerPage />} />
        <Route path="/org/:orgId/team/:teamId" element={<OrgVolunteerPage />} />
        <Route path="/org/:orgId/room-ideas" element={<Navigate to="room-design" replace />} />
        <Route path="/org/:orgId/contact" element={<OrgContactPage />} />
        <Route path="/org/:orgId/manage" element={<OrgHomePage />} />
        <Route path="/org/:orgId/volunteers" element={<OrgVolunteerCompliancePage />} />
        <Route path="/org/:orgId/teams" element={<ManageTeamsPage />} />
        <Route path="/org/:orgId/room-design" element={<RoomIdeasPage />} />
        <Route path="/org/:orgId/photoshoppe-lite" element={<PhotoshoppeLitePage />} />
        <Route path="/org/:orgId/vbs-plan" element={<VbsPlanPage />} />
        <Route path="/org/:orgId/registration" element={<VbsRegistrationPage />} />
        <Route path="/org/:orgId/cooking-plan" element={<CookingPlanPage />} />
        <Route path="/org/:orgId/reviews" element={<ReviewsPage />} />
        <Route path="/org/:orgId/share" element={<SharePage />} />
        <Route path="/org/:orgId/setup" element={<SetupPage />} />
        <Route path="/org/:orgId/messages" element={<MessagesPage />} />
      </Route>
    </Routes>
  );
}
