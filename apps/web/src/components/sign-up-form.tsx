import { Button } from "@custora/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@custora/ui/components/field";
import { Input } from "@custora/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignUpForm({
	onSwitchToSignIn,
}: {
	onSwitchToSignIn: () => void;
}) {
	const navigate = useNavigate({ from: "/" });
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
			name: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					email: value.email,
					password: value.password,
					name: value.name,
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
				name: z.string().min(2, "Name must be at least 2 characters"),
				email: z.email("Enter a valid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	if (isPending) {
		return <Loader />;
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium text-xl tracking-tight">
					Create an account
				</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					You will need a tracked site before any data shows up.
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
					<form.Field name="name">
						{(field) => (
							<Field
								data-invalid={field.state.meta.errors.length > 0 || undefined}
							>
								<FieldLabel htmlFor={field.name}>Name</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									autoComplete="name"
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
									autoComplete="new-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={field.state.meta.errors.length > 0 || undefined}
								/>
								{/* Stated up front rather than only after a failed submit. */}
								<FieldDescription>At least 8 characters.</FieldDescription>
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
								{isSubmitting ? "Creating account" : "Create account"}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			<p className="text-muted-foreground text-sm">
				Already have an account?{" "}
				<Button
					variant="link"
					className="h-auto p-0 align-baseline"
					onClick={onSwitchToSignIn}
				>
					Sign in
				</Button>
			</p>
		</div>
	);
}
