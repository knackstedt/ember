export type MoviesNavItem = "all" | "favorites" | "genres" | "directors" | "folders" | "groups";

export interface MovieGroup {
  id: string;
  name: string;
  movieCount: number;
  coverUrl?: string;
}
