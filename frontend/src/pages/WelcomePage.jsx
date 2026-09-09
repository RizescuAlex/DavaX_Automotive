import { useState } from "react";
import ProfileGrid from "../components/ProfileGrid";
import { profiles } from "../data/profiles";

function WelcomePage() {
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [confirmation, setConfirmation] = useState("");

  function handleProfileSelect(profile) {
    setSelectedProfile(profile);
    setConfirmation("");
  }

  function handleContinue() {
    if (selectedProfile) setConfirmation(`Profile loaded for ${selectedProfile.name}.`);
  }

  return (
    <main className="welcome-page">
      <div className="background-glow glow-one" />
      <div className="background-glow glow-two" />
      <section className="profile-container" aria-labelledby="welcome-title">
        <div className="brand"><span className="brand-dot" />DRIVE<span>AI</span></div>
        <p className="eyebrow">PERSONALIZED INFOTAINMENT SYSTEM</p>
        <h1 id="welcome-title">Who is driving today?</h1>
        <p className="subtitle">Select your profile to personalize your driving experience.</p>
        <ProfileGrid profiles={profiles} selectedProfile={selectedProfile} onSelect={handleProfileSelect} />
        <button
          className={`continue-button ${selectedProfile ? "active" : ""}`}
          onClick={handleContinue}
          disabled={!selectedProfile}
          type="button"
        >
          Continue <span aria-hidden="true">→</span>
        </button>
        <p className="confirmation" aria-live="polite">{confirmation}</p>
        <p className="footer-text">Your preferences will be loaded automatically</p>
      </section>
    </main>
  );
}

export default WelcomePage;
