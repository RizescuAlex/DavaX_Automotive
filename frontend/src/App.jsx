import { useState } from "react";
import "./App.css";

const profiles = [
  { id: 1, name: "Alex Morgan", role: "Primary Driver", color: "#00e5ff" },
  { id: 2, name: "Maria Popescu", role: "Driver", color: "#8b5cf6" },
  { id: 3, name: "Daniel Ionescu", role: "Passenger", color: "#22c55e" },
  { id: 4, name: "Guest User", role: "Guest", color: "#f59e0b" }
];

function getInitials(name) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("");
}

function App() {
  const [selectedProfile, setSelectedProfile] = useState(null);

  function handleContinue() {
    if (!selectedProfile) return;

    alert(`Welcome, ${selectedProfile.name}!`);
  }

  return (
    <main className="app">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <section className="profile-container">
        <div className="brand">
          <span className="brand-dot"></span>
          DRIVE<span>AI</span>
        </div>

        <p className="eyebrow">PERSONALIZED INFOTAINMENT SYSTEM</p>

        <h1>Who is driving today?</h1>

        <p className="subtitle">
          Select your profile to personalize your driving experience.
        </p>

        <div className="profiles-grid">
          {profiles.map((profile) => {
            const isSelected = selectedProfile?.id === profile.id;

            return (
              <button
                className={`profile-card ${isSelected ? "selected" : ""}`}
                key={profile.id}
                onClick={() => setSelectedProfile(profile)}
              >
                <div
                  className="avatar"
                  style={{
                    "--avatar-color": profile.color
                  }}
                >
                  {getInitials(profile.name)}
                </div>

                <div className="profile-info">
                  <h2>{profile.name}</h2>
                  <p>{profile.role}</p>
                </div>

                <div className="selection-indicator">
                  {isSelected ? "✓" : ""}
                </div>
              </button>
            );
          })}
        </div>

        <button
          className={`continue-button ${selectedProfile ? "active" : ""}`}
          onClick={handleContinue}
          disabled={!selectedProfile}
        >
          Continue
          <span>→</span>
        </button>

        <p className="footer-text">
          Your preferences will be loaded automatically
        </p>
      </section>
    </main>
  );
}

export default App;