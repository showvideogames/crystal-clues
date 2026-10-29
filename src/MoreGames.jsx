import { useId } from "react";
import games from "./portfolioGames.json";
import "./moreGames.css";

export default function MoreGames() {
  const titleId = useId();
  return <section className="more-games" aria-labelledby={titleId}>
    <h3 id={titleId}>More Games</h3>
    <ul>{games.map((game) => <li key={game.url}>
      <a href={game.url} target="_blank" rel="noopener noreferrer">
        <img src={game.asset} width="40" height="40" alt=""/>
        <span><strong>{game.title}</strong><small>{game.subtitle}</small></span>
        <span aria-hidden="true">↗</span><span className="more-games-sr"> (opens in a new tab)</span>
      </a>
    </li>)}</ul>
  </section>;
}
