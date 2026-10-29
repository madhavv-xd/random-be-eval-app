import { useState } from 'react';

// Rounded-square ("squircle") avatars; falls back to a gradient initial when there's no photo (or it fails to load).
export default function Avatar({ user, size = 40, className = '' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (user?.avatarUrl && !failed) {
    return <img src={user.avatarUrl} alt="" onError={() => setFailed(true)} style={style} className={`shrink-0 rounded-[35%] bg-raised object-cover ${className}`} />;
  }
  return (
    <div style={{ ...style, fontSize: size * 0.42 }} className={`grid shrink-0 place-items-center rounded-[35%] bg-linear-to-br from-coral to-amber font-bold text-bg ${className}`}>
      {user?.name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}
