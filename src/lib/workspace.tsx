import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

import { useTRPC } from "@/utils/trpc";

const STORAGE_KEY = "custora.workspace";

type Site = {
	id: string;
	name: string;
	domain: string;
	writeKey: string;
	eventCount: number;
	visitorCount: number;
};

type Workspace = {
	/** Undefined until the site list has loaded, or when there are no sites. */
	siteId: string | undefined;
	site: Site | undefined;
	sites: Site[];
	isPending: boolean;
	/**
	 * No sites exist, as opposed to none loaded yet. Site-scoped queries are held
	 * back until there is a site to scope them to, so pages can no longer learn
	 * this from a failing query — they have to ask.
	 */
	isEmpty: boolean;
	switchTo: (siteId: string) => void;
};

const WorkspaceContext = createContext<Workspace | null>(null);

/**
 * One workspace is one site. Every screen reads the active site from here and
 * passes it explicitly into its queries, rather than the server quietly picking
 * one — with more than one site, an implicit default is the kind of thing that
 * shows you the wrong numbers without ever looking wrong.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const sitesQuery = useQuery(trpc.sites.list.queryOptions());

	const [stored, setStored] = useState<string | undefined>(() => {
		if (typeof window === "undefined") return undefined;
		return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
	});

	const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);

	/**
	 * A remembered site can be deleted from another tab or another machine, so
	 * the stored id is treated as a preference to validate rather than a fact.
	 */
	const siteId = useMemo(() => {
		if (!sites.length) return undefined;
		if (stored && sites.some((site) => site.id === stored)) return stored;
		return sites[0]?.id;
	}, [sites, stored]);

	const site = useMemo(
		() => sites.find((candidate) => candidate.id === siteId),
		[sites, siteId],
	);

	// Drop a stale preference so it stops being reconsidered on every render.
	useEffect(() => {
		if (!siteId || siteId === stored) return;
		if (typeof window !== "undefined") {
			window.localStorage.setItem(STORAGE_KEY, siteId);
		}
		setStored(siteId);
	}, [siteId, stored]);

	const switchTo = useCallback(
		(next: string) => {
			if (next === siteId) return;
			if (typeof window !== "undefined") {
				window.localStorage.setItem(STORAGE_KEY, next);
			}
			setStored(next);
			// Everything on screen is scoped to a site, so none of it survives a switch.
			queryClient.invalidateQueries();
		},
		[siteId, queryClient],
	);

	const value = useMemo<Workspace>(
		() => ({
			siteId,
			site,
			sites,
			isPending: sitesQuery.isPending,
			isEmpty: !sitesQuery.isPending && sites.length === 0,
			switchTo,
		}),
		[siteId, site, sites, sitesQuery.isPending, switchTo],
	);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): Workspace {
	const value = useContext(WorkspaceContext);
	if (!value) {
		throw new Error("useWorkspace must be used inside WorkspaceProvider");
	}
	return value;
}
