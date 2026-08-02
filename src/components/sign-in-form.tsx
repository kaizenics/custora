import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm({
	onSwitchToSignUp,
}: {
	onSwitchToSignUp: () => void;
}) {
	const navigate = useNavigate({ from: "/" });
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
				},
				{
					onSuccess: () => {
						navigate({ to: "/overview" });
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Enter a valid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	if (isPending) {
		// The auth layout already centres this column full-height.
		return <Loader className="min-h-64" />;
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium text-xl tracking-tight">Sign in</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Pick up where your attribution data left off.
				</p>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<FieldGroup>
					<form.Field name="email">
						{(field) => (
							<Field
								data-invalid={field.state.meta.errors.length > 0 || undefined}
							>
								<FieldLabel htmlFor={field.name}>Email</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									autoComplete="email"
									// Signing in is the only thing this page does.
									autoFocus
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={field.state.meta.errors.length > 0 || undefined}
								/>
								<FieldError errors={field.state.meta.errors} />
							</Field>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<Field
								data-invalid={field.state.meta.errors.length > 0 || undefined}
							>
								<FieldLabel htmlFor={field.name}>Password</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									autoComplete="current-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={field.state.meta.errors.length > 0 || undefined}
								/>
								<FieldError errors={field.state.meta.errors} />
							</Field>
						)}
					</form.Field>

					<form.Subscribe
						selector={(state) => ({
							canSubmit: state.canSubmit,
							isSubmitting: state.isSubmitting,
						})}
					>
						{({ canSubmit, isSubmitting }) => (
							<Button
								type="submit"
								className="w-full"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? (
									<Loader2 data-icon="inline-start" className="animate-spin" />
								) : null}
								{isSubmitting ? "Signing in" : "Sign in"}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			<p className="text-muted-foreground text-sm">
				No account yet?{" "}
				<Button
					variant="link"
					className="h-auto p-0 align-baseline"
					onClick={onSwitchToSignUp}
				>
					Create one
				</Button>
			</p>
		</div>
	);
}
