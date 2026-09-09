function getInitials(name) {
  return name.split(" ").map((word) => word[0]).join("");
}

function ProfileCard({ profile, isSelected, onSelect }) {
  return (
    <button
      className={`profile-card ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(profile)}
      type="button"
      aria-pressed={isSelected}
    >
      <div className="avatar" style={{ "--avatar-color": profile.color }} aria-hidden="true">
        {getInitials(profile.name)}
      </div>
      <div className="profile-info">
        <h2>{profile.name}</h2>
        <p>{profile.role}</p>
      </div>
      <span className="selection-indicator" aria-hidden="true">{isSelected ? "✓" : ""}</span>
    </button>
  );
}

export default ProfileCard;
