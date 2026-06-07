import { Game } from "../../shared/types";
import { listInstalledItchGames } from "../services/itch.service";

export function scanItchGames(): Game[] {
  return listInstalledItchGames();
}
