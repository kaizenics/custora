import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/invite/$token")({
	ssr: false,
	component: ClaimInvitePage,
});

const MIN_PASSWORD = 12;

function ClaimInvitePage() {
	const { token } = Route.useParams();
	const trpc = useTRPC();
	const navigate = useNavigate();

	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");

	// Checked before asking for anything, so a dead link says so immediately
	// rather than after the person has picked a password.
	const preview = useQuery(
		trpc.invites.peek.queryOptions({ token }, { retry: false }),
	);

	const accept = useMutation(
		trpc.invites.accept.mutationOptions({
			onSuccess: async ({ email }) => {
				// Straight in — making someone re-type credentials they just chose
				// is a pointless extra step.
				await authClient.signIn.email(
					{ email, password },
					{
						onSuccess: () => navigate({ to: "/overview" }),
						onError: () => {
							toast.success("Account created. Please sign in.");
							navigate({ to: "/login" });
						},
					},
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const mismatch = confirm.length > 0 && password !== confirm;
	const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
	const ready =
		name.trim().length > 0 &&
		password.length >= MIN_PASSWORD &&
		password === confirm;

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				{preview.isPending ? (
					<CardHeader>
						<Skeleton className="h-5 w-40" />
						<Skeleton className="mt-2 h-4 w-56" />
					</CardHeader>
				) : preview.error ? (
					<>
						<CardHeader>
							<CardTitle>This link will not work</CardTitle>
							<CardDescription>{preview.error.message}</CardDescription>
						</CardHeader>
						<CardContent>
							<Button variant="outline" render={<Link to="/login" />}>
								Go to sign in
							</Button>
						</CardContent>
					</>
				) : (
					<>
						<CardHeader>
							<CardTitle>Join Custora</CardTitle>
							<CardDescription>
								Setting up <span className="font-medium">{preview.data?.email}</span>{" "}
								as {preview.data?.role === "admin" ? "an admin" : "a member"}.
								Choose a password and you are in.
							</CardDescription>
						</CardHeader>

						<CardContent>
							<form
								className="flex flex-col gap-3"
								onSubmit={(e) => {
									e.preventDefault();
									if (!ready) return;
									accept.mutate({ token, name: name.trim(), password });
								}}
							>
								<div className="flex flex-col gap-2">
									<Label htmlFor="invite-name">Your name</Label>
									<Input
										id="invite-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										autoComplete="name"
										required
									/>
								</div>

								<div className="flex flex-col gap-2">
									<Label htmlFor="invite-password">Password</Label>
									<Input
										id="invite-password"
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										autoComplete="new-password"
										required
									/>
									<p
										className={
											tooShort
												? "text-[11px] text-destructive"
												: "text-[11px] text-muted-foreground"
										}
									>
										At least {MIN_PASSWORD} characters.
									</p>
								</div>

								<div className="flex flex-col gap-2">
									<Label htmlFor="invite-confirm">Confirm password</Label>
									<Input
										id="invite-confirm"
										type="password"
										value={confirm}
										onChange={(e) => setConfirm(e.target.value)}
										autoComplete="new-password"
										required
									/>
									{mismatch ? (
										<p className="text-[11px] text-destructive">
											These do not match.
										</p>
									) : null}
								</div>

								<Button type="submit" disabled={!ready || accept.isPending}>
									{accept.isPending ? "Creating account" : "Create account"}
								</Button>
							</form>
						</CardContent>
					</>
				)}
			</Card>
		</div>
	);
}
