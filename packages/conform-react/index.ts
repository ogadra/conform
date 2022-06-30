import type {
	ButtonHTMLAttributes,
	FormEvent,
	FormEventHandler,
	FormHTMLAttributes,
	InputHTMLAttributes,
	RefObject,
	SelectHTMLAttributes,
	TextareaHTMLAttributes,
} from 'react';
import type { FieldsetElement, FieldConfig, Schema } from '@conform-to/dom';
import { useRef, useState, useEffect, useMemo } from 'react';
import {
	isFieldElement,
	setFieldState,
	reportValidity,
	shouldSkipValidate,
	createFieldConfig,
	createControlButton,
	getFields,
	getName,
} from '@conform-to/dom';

export { getFields };

type FormProps = Pick<
	FormHTMLAttributes<HTMLFormElement>,
	'onSubmit' | 'onReset' | 'noValidate'
>;

interface UseFormOptions extends FormProps {
	fallbackMode?: 'native' | 'none';
	initialReport?: 'onSubmit' | 'onChange' | 'onBlur';
}

interface SetupProps<Type> {
	fieldset: {
		ref: RefObject<HTMLFieldSetElement>;
		name?: string;
		form?: string;
		onChange: FormEventHandler<HTMLFieldSetElement>;
		onReset: FormEventHandler<HTMLFieldSetElement>;
		onInvalid: FormEventHandler<HTMLFieldSetElement>;
	};
	field: { [Key in keyof Type]-?: FieldConfig<Type[Key]> };
}

interface FieldListControl {
	prepend(): ButtonHTMLAttributes<HTMLButtonElement>;
	append(): ButtonHTMLAttributes<HTMLButtonElement>;
	remove(index: number): ButtonHTMLAttributes<HTMLButtonElement>;
}

export const f = {
	input<Type extends string | number | Date | undefined>(
		config: FieldConfig<Type>,
		{ type, value }: { type?: string; value?: string } = {},
	): InputHTMLAttributes<HTMLInputElement> {
		return {
			type,
			name: config.name,
			form: config.form,
			value: type === 'checkbox' || type === 'radio' ? value : undefined,
			defaultValue: `${config.value ?? ''}`,
			defaultChecked:
				type === 'checkbox' || type === 'radio'
					? config.value === value
					: undefined,
			required: config.constraint?.required,
			minLength: config.constraint?.minLength,
			maxLength: config.constraint?.maxLength,
			min: config.constraint?.min,
			max: config.constraint?.max,
			step: config.constraint?.step,
			pattern: config.constraint?.pattern,
		};
	},
	select<T extends any>(
		config: FieldConfig<T>,
	): SelectHTMLAttributes<HTMLSelectElement> {
		return {
			name: config.name,
			form: config.form,
			defaultValue: `${config.value ?? ''}`,
			required: config.constraint?.required,
			multiple: config.constraint?.multiple,
		};
	},
	textarea<T extends string | undefined>(
		config: FieldConfig<T>,
	): TextareaHTMLAttributes<HTMLTextAreaElement> {
		return {
			name: config.name,
			form: config.form,
			defaultValue: `${config.value ?? ''}`,
			required: config.constraint?.required,
			minLength: config.constraint?.minLength,
			maxLength: config.constraint?.maxLength,
		};
	},
};

export function useForm({
	onReset,
	onSubmit,
	noValidate = false,
	fallbackMode = 'none',
	initialReport = 'onSubmit',
}: UseFormOptions = {}): FormProps & {
	ref: RefObject<HTMLFormElement>;
} {
	const ref = useRef<HTMLFormElement>(null);
	const [formNoValidate, setFormNoValidate] = useState(
		noValidate || fallbackMode !== 'native',
	);
	const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
		if (!noValidate) {
			setFieldState(event.currentTarget, { touched: true });

			if (
				!shouldSkipValidate(event.nativeEvent as SubmitEvent) &&
				!event.currentTarget.reportValidity()
			) {
				event.preventDefault();
			}
		}

		onSubmit?.(event);
	};
	const handleReset: FormEventHandler<HTMLFormElement> = (event) => {
		setFieldState(event.currentTarget, { touched: false });

		onReset?.(event);
	};

	useEffect(() => {
		setFormNoValidate(true);
	}, []);

	useEffect(() => {
		if (noValidate) {
			return;
		}

		const handleChange = (event: Event) => {
			if (!isFieldElement(event.target) || event.target?.form !== ref.current) {
				return;
			}

			if (initialReport === 'onChange') {
				setFieldState(event.target, { touched: true });
			}

			if (ref.current) {
				reportValidity(ref.current);
			}
		};
		const handleBlur = (event: FocusEvent) => {
			if (!isFieldElement(event.target) || event.target?.form !== ref.current) {
				return;
			}

			if (initialReport === 'onBlur') {
				setFieldState(event.target, { touched: true });
			}

			if (ref.current) {
				reportValidity(ref.current);
			}
		};

		document.body.addEventListener('input', handleChange);
		document.body.addEventListener('focusout', handleBlur);

		return () => {
			document.body.removeEventListener('input', handleChange);
			document.body.removeEventListener('focusout', handleBlur);
		};
	}, [noValidate, initialReport]);

	return {
		ref,
		onSubmit: handleSubmit,
		onReset: handleReset,
		noValidate: formNoValidate,
	};
}

export function useFieldset<Type extends Record<string, any>>(
	{ constraint, validate }: Schema<Type>,
	config: Partial<FieldConfig<Type>> = {},
): [SetupProps<Type>, Record<keyof Type, string>] {
	const ref = useRef<HTMLFieldSetElement>(null);
	const [errorMessage, setErrorMessage] = useState(() =>
		Object.fromEntries(
			Object.keys(constraint).reduce<Array<[string, string]>>(
				(result, name) => {
					const error = config.error?.[name];

					if (typeof error === 'string') {
						result.push([name, error]);
					}

					return result;
				},
				[],
			),
		),
	);

	const setup: SetupProps<Type> = {
		fieldset: {
			ref,
			name: config.name,
			form: config.form,
			onChange(e: FormEvent<FieldsetElement>) {
				const fieldset = e.currentTarget;

				validate?.(fieldset);
				setErrorMessage((error) => resetErrorMessages(fieldset, error));
			},
			onReset(e: FormEvent<FieldsetElement>) {
				setFieldState(e.currentTarget, { touched: false });
				setErrorMessage({} as Record<keyof Type, string>);
			},
			onInvalid(e: FormEvent<FieldsetElement>) {
				const element = isFieldElement(e.target) ? e.target : null;
				const key = Object.keys(constraint).find(
					(key) => element?.name === getName([e.currentTarget.name, key]),
				);

				if (!element || !key) {
					return;
				}

				// Disable browser report
				e.preventDefault();

				setErrorMessage((message) => {
					if (message[key] === element.validationMessage) {
						return message;
					}

					return {
						...message,
						[key]: element.validationMessage,
					};
				});
			},
		},
		field: createFieldConfig(
			{ constraint, validate },
			{
				...config,
				error: Object.assign({}, config.error, errorMessage),
			},
		),
	};

	useEffect(() => {
		const fieldset = ref.current;
		const form = fieldset?.form;

		if (!fieldset) {
			console.warn(
				'Missing fieldset ref; Please make sure the ref to be passed to the element',
			);
			return;
		}

		if (!form) {
			console.warn(
				'No form related to the fieldset; It must be placed within the form tag or else a form id should be provided',
			);
		}

		validate?.(fieldset);
		setErrorMessage((error) => resetErrorMessages(fieldset, error));
	}, [validate]);

	useEffect(() => {
		setErrorMessage((error) =>
			Object.keys(constraint).reduce((result, name) => {
				const prevError = error[name];
				const nextError = config.error?.[name];

				if (typeof nextError === 'string' && prevError !== nextError) {
					return {
						...result,
						[name]: nextError,
					};
				}

				return result;
			}, error),
		);
	}, [config.error, constraint]);

	return [setup, errorMessage as Record<keyof Type, string>];
}

export function useFieldList<Type extends Array<any>>(
	config: FieldConfig<Type>,
): [
	Array<{
		key: string;
		config: FieldConfig<
			Type extends Array<infer InnerType> ? InnerType : never
		>;
	}>,
	FieldListControl,
] {
	const size = config.value?.length ?? 1;
	const [keys, setKeys] = useState(() => [...Array(size).keys()]);
	const list = useMemo(
		() =>
			keys.map<{ key: string; config: FieldConfig }>((key, index) => ({
				key: `${key}`,
				config: {
					...config,
					name: `${config.name}[${index}]`,
					value: config.value?.[index],
					error: config.error?.[index],
					// @ts-expect-error
					constraint: {
						...config.constraint,
						multiple: false,
					},
				},
			})),
		[keys, config],
	);
	const controls: FieldListControl = {
		prepend() {
			return {
				...createControlButton(config.name, 'prepend', {}),
				onClick(e) {
					setKeys((keys) => [Date.now(), ...keys]);
					e.preventDefault();
				},
			};
		},
		append() {
			return {
				...createControlButton(config.name, 'append', {}),
				onClick(e) {
					setKeys((keys) => [...keys, Date.now()]);
					e.preventDefault();
				},
			};
		},
		remove(index) {
			return {
				...createControlButton(config.name, 'remove', { index }),
				onClick(e) {
					setKeys((keys) => [
						...keys.slice(0, index),
						...keys.slice(index + 1),
					]);
					e.preventDefault();
				},
			};
		},
	};

	useEffect(() => {
		setKeys((keys) => {
			if (keys.length === size) {
				return keys;
			}

			return [...Array(size).keys()];
		});
	}, [size]);

	return [list, controls];
}

function resetErrorMessages<T extends Record<string, any>>(
	fieldset: FieldsetElement,
	error: T,
): T {
	const updates: Array<[string, string]> = [];

	for (let [key, message] of Object.entries(error)) {
		if (!message) {
			continue;
		}

		const fields = getFields(fieldset, key);

		for (let field of fields) {
			if (field.validity.valid) {
				updates.push([key, '']);
			}
		}
	}

	if (updates.length === 0) {
		return error;
	}

	return {
		...error,
		...Object.fromEntries(updates),
	};
}
