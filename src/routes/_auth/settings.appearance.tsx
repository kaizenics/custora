import { createFileRoute } from "@tanstack/react-router";

import { SettingsSection } from "@/components/settings-section";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_auth/settings/appearance")({
	component: AppearancePage,
});

function AppearancePage() {
	return (
		<SettingsSection
			title="Appearance"
			description="Applies to this browser only — the preference is stored locally, not on your account."
		>
			<ThemeToggle />
		</SettingsSection>
	);
}
