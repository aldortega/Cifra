import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconoEscudo = (p: Props) => (
  <Base {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
);

export const IconoSubir = (p: Props) => (
  <Base {...p}>
    <path d="M12 15V4m0 0-4 4m4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Base>
);

export const IconoArchivo = (p: Props) => (
  <Base {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Base>
);

export const IconoCerrar = (p: Props) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconoCheck = (p: Props) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

export const IconoDescartar = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m6 6 12 12" />
  </Base>
);

export const IconoReloj = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

export const IconoDescargar = (p: Props) => (
  <Base {...p}>
    <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </Base>
);

export const IconoAlerta = (p: Props) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4m0 3h.01" />
  </Base>
);

export const IconoOjo = (p: Props) => (
  <Base {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.5" />
  </Base>
);

export const IconoFlechaDerecha = (p: Props) => (
  <Base {...p}>
    <path d="M5 12h14m0 0-5-5m5 5-5 5" />
  </Base>
);

export const IconoBuscar = (p: Props) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Base>
);

export const IconoCandado = (p: Props) => (
  <Base {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Base>
);

export const IconoArriba = (p: Props) => (
  <Base {...p}>
    <path d="m6 15 6-6 6 6" />
  </Base>
);

export const IconoAbajo = (p: Props) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

/** Ícono de archivo PDF. */
export const IconoPdf = (p: Props) => (
  <svg viewBox="0 0 15 15" fill="none" aria-hidden="true" width="1em" height="1em" {...p}>
    <path
      fill="currentColor"
      d="M2.5 6.5V6H2V6.5H2.5ZM6.5 6.5V6H6V6.5H6.5ZM6.5 10.5H6V11H6.5V10.5ZM13.5 3.5H14V3.29289L13.8536 3.14645L13.5 3.5ZM10.5 0.5L10.8536 0.146447L10.7071 0H10.5V0.5ZM2.5 7H3.5V6H2.5V7ZM3 11V8.5H2V11H3ZM3 8.5V6.5H2V8.5H3ZM3.5 8H2.5V9H3.5V8ZM4 7.5C4 7.77614 3.77614 8 3.5 8V9C4.32843 9 5 8.32843 5 7.5H4ZM3.5 7C3.77614 7 4 7.22386 4 7.5H5C5 6.67157 4.32843 6 3.5 6V7ZM6 6.5V10.5H7V6.5H6ZM6.5 11H7.5V10H6.5V11ZM9 9.5V7.5H8V9.5H9ZM7.5 6H6.5V7H7.5V6ZM9 7.5C9 6.67157 8.32843 6 7.5 6V7C7.77614 7 8 7.22386 8 7.5H9ZM7.5 11C8.32843 11 9 10.3284 9 9.5H8C8 9.77614 7.77614 10 7.5 10V11ZM10 6V11H11V6H10ZM10.5 7H13V6H10.5V7ZM10.5 9H12V8H10.5V9ZM2 5V1.5H1V5H2ZM13 3.5V5H14V3.5H13ZM2.5 1H10.5V0H2.5V1ZM10.1464 0.853553L13.1464 3.85355L13.8536 3.14645L10.8536 0.146447L10.1464 0.853553ZM2 1.5C2 1.22386 2.22386 1 2.5 1V0C1.67157 0 1 0.671573 1 1.5H2ZM1 12V13.5H2V12H1ZM2.5 15H12.5V14H2.5V15ZM14 13.5V12H13V13.5H14ZM12.5 15C13.3284 15 14 14.3284 14 13.5H13C13 13.7761 12.7761 14 12.5 14V15ZM1 13.5C1 14.3284 1.67157 15 2.5 15V14C2.22386 14 2 13.7761 2 13.5H1Z"
    />
  </svg>
);

/** Ícono de archivo Word, con el mismo trazo que el de PDF. */
export const IconoDocx = (p: Props) => (
  <svg
    viewBox="0 0 15 15"
    fill="none"
    stroke="currentColor"
    strokeWidth={1}
    aria-hidden="true"
    width="1em"
    height="1em"
    {...p}
  >
    {/* Hoja con la esquina doblada, cortada donde van las letras. */}
    <path d="M1.5 5V1.5a1 1 0 0 1 1-1h8l3 3V5M1.5 12v1.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V12" />
    {/* D */}
    <path d="M2.5 6.5v4h1A1.5 1.5 0 0 0 5 9V8a1.5 1.5 0 0 0-1.5-1.5h-1Z" />
    {/* O */}
    <rect x="6.5" y="6.5" width="2.5" height="4" rx="1.25" />
    {/* C */}
    <path d="M13 6.5h-1.25a1.25 1.25 0 0 0-1.25 1.25v1.5a1.25 1.25 0 0 0 1.25 1.25H13" />
  </svg>
);
