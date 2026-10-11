import { avatarKey, avatarLetter, avatarSrc } from "./avatars";
import "./avatar.css";

// A player's avatar: their chosen picture, or the default crystal ball with
// the first letter of their name on it. The letter is real text laid over
// the picture (never part of the image), so it follows the name and scales
// with the avatar; the animals have no letter. Decorative: the name always
// sits beside it, so it is hidden from screen readers.
export function Avatar({ name = "", avatar = null, size = 52, className = "" }) {
  const key = avatarKey(avatar);
  const letter = avatarLetter(key, name);
  return (
    <span className={`fr-avatar ${className}`} data-avatar={key} style={{ "--av": `${size}px` }} aria-hidden="true">
      <img src={avatarSrc(key)} alt="" width={size} height={size} decoding="async" draggable="false"/>
      {letter && <span className="fr-avatar-letter">{letter}</span>}
    </span>
  );
}
