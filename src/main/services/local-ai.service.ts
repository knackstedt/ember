import {
  isAiAvailable,
  naturalLanguageToFilter as embeddedNlToFilter,
  aiGroupItems as embeddedAiGroupItems,
} from "./embedded-ai.service";
import { SmartFilterGroup, CollectionItemType, AiGroup } from "../../shared/types";

export async function isOllamaAvailable(): Promise<boolean> {
  return isAiAvailable();
}

export async function naturalLanguageToFilter(
  query: string,
  itemType: string,
): Promise<SmartFilterGroup | null> {
  return embeddedNlToFilter(query, itemType as CollectionItemType);
}

export async function aiGroupItems(
  items: Array<{
    id: string;
    title: string;
    genres?: string[];
    tags?: string[];
    description?: string;
    platform?: string;
    artist?: string;
    album?: string;
    genre?: string;
  }>,
  groupCount: number,
): Promise<AiGroup[]> {
  return embeddedAiGroupItems(items, groupCount);
}
