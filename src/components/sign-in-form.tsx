import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm({
	onSwitchToSignUp,
}: {
	/** Omitted when registration is closed, so no dead link is shown. */
	onSwitchToSignUp?: () => void;
}) {
	const navigate = useNavigate({ from: "/" });
	const { isPending } = authClient.useSession();
	const [showPassword, setShowPassword] = useState(false);

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
		<div className="flex flex-col gap-8">
			<div>
				<div className="auth-secure mb-5 flex size-10 items-center justify-center rounded-xl">
					<LockKeyhole className="size-4" aria-hidden />
				</div>
				<h1 className="font-semibold text-3xl tracking-[-0.045em] sm:text-4xl">
					Welcome back
				</h1>
				<p className="mt-3 max-w-sm text-muted-foreground text-sm leading-relaxed">
					Sign in to see which campaigns are turning into customers.
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
					<form.Field name="email">
						{(field) => (
							<Field
								data-invalid={field.state.meta.errors.length > 0 || undefined}
							>
								<FieldLabel htmlFor={field.name}>Email</FieldLabel>
								<InputGroup>
									<InputGroupInput
										id={field.name}
										name={field.name}
										type="email"
										autoComplete="email"
										autoFocus
										placeholder="you@company.com"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={
											field.state.meta.errors.length > 0 || undefined
										}
									/>
								</InputGroup>
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
								<InputGroup>
									<InputGroupInput
										id={field.name}
										name={field.name}
										type={showPassword ? "text" : "password"}
										autoComplete="current-password"
										placeholder="Enter your password"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={
											field.state.meta.errors.length > 0 || undefined
										}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											size="icon-xs"
											onClick={() => setShowPassword((visible) => !visible)}
											aria-label={
												showPassword ? "Hide password" : "Show password"
											}
											aria-pressed={showPassword}
										>
											{showPassword ? <EyeOff /> : <Eye />}
										</InputGroupButton>
									</InputGroupAddon>
								</InputGroup>
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
								{isSubmitting ? "Signing in" : "Sign in"}
								{!isSubmitting ? <ArrowRight data-icon="inline-end" /> : null}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>

			{onSwitchToSignUp ? (
				<p className="text-center text-muted-foreground text-sm">
					No account yet?{" "}
					<Button
						variant="link"
						className="h-auto p-0 align-baseline"
						onClick={onSwitchToSignUp}
					>
						Create one
					</Button>
				</p>
			) : null}
		</div>
	);
}
