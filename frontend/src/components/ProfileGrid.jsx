import ProfileCard from "./ProfileCard";

function ProfileGrid({ profiles, selectedProfile, onSelect }) {
  return (
    <div className="profiles-grid">
      {profiles.map((profile) => (
        <ProfileCard
          key={profile.id}
          profile={profile}
          isSelected={selectedProfile?.id === profile.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export default ProfileGrid;
