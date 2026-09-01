import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
		// The auth layout already centres this column full-height.
		return <Loader className="min-h-64" />;
	}

	return (
		<div className="flex flex-col gap-8">
			<div>
				<div className="auth-secure mb-5 flex size-10 items-center justify-center rounded-xl">
					<UserPlus className="size-4" aria-hidden />
				</div>
				<h1 className="font-semibold text-3xl tracking-[-0.045em] sm:text-4xl">
					Create an account
				</h1>
				<p className="mt-3 max-w-sm text-muted-foreground text-sm leading-relaxed">
					Start connecting campaigns, customer journeys, and revenue.
				</p>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-5">
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
									placeholder="Your name"
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
									placeholder="you@company.com"
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
									placeholder="Create a password"
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
								size="lg"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? (
									<Loader2 data-icon="inline-start" className="animate-spin" />
								) : null}
								{isSubmitting ? "Creating account" : "Create account"}
								{!isSubmitting ? <ArrowRight data-icon="inline-end" /> : null}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			<p className="text-center text-muted-foreground text-sm">
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
