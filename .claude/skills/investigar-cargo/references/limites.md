# Lo lícito, hecho operativo

La orden es «todo lo lícito». Lícito, para un medio que publica sobre personas
vivas con derecho de réplica, es esto y no más:

## Vías

- Documentos públicos y páginas públicas. Nada tras un inicio de sesión, nada de
  registros de pago (Registro Mercantil, informes de Axesor/eInforma), nada de
  catastro por titular (exige certificado: no es una vía libre).
- Las cuentas públicas del propio cargo sí; las cuentas de terceros que hablan de
  él son pistas, nunca fuentes.
- El navegador del usuario lee lo que el rastreador no alcanza, pero no salta
  muros de pago ni captchas.

## Categorías que nunca entran

Menores. Salud. Ideología más allá del partido por el que concurre. Orientación
sexual. Religión. Domicilio, DNI, teléfono, correo personal. Art. 9 RGPD y LO
1/1982: no hay nexo con el cargo que las justifique.

## Familia y patrimonio: la regla de las dos llaves

Un vínculo familiar o un bien se recoge en el dossier como **publicable** sólo con
las dos llaves a la vez:

1. **Documento explícito** que lo diga — un acta, un BOP, un BORME, una sentencia
   firme, una declaración. Dos apellidos iguales en un BORME no son un parentesco
   (es la lección 139/19: la coincidencia nominal en un pueblo de 24.000 vecinos
   fabrica falsos positivos).
2. **Nexo con el cargo** — un contrato, una subvención, un nombramiento, una
   decisión municipal, una incompatibilidad. Sin nexo, la vida familiar es vida
   privada por muy documentada que esté.

Con una sola llave, queda en el dossier como «no publicable: sin nexo» o «no
publicable: sin documento», y ahí se queda.

Patrimonio: sólo lo que un documento público diga (declaraciones, BORME, BOP,
BOE, actas). Nunca inferido de fotos, de redes ni de un buscador de inmuebles.

## Alegaciones

Una acusación en prensa no es un hecho: se recoge como «según <medio>, <fecha>»,
con el extracto literal y la copia, y obliga a `legalSensitivity: high`, que a su
vez exige `--ack-legal-review` de una persona antes de publicar. Una sentencia se
cita sólo si es firme y nombra al cargo; CENDOJ anonimiza, así que la vía suele
ser el acta o el boletín que la recoge.

## Homonimia

Un nombre no es una identidad. Antes de atribuir, un segundo identificador:
municipio + cargo + fecha, el DNI parcial de un BOP, la edad, la fotografía, el
partido. Trampas conocidas: Rafael Gómez Muñoz (EUPV 2019) ≠ Rafael Gómez Sánchez
(PSOE); Salomé Pradas (consellera) ≠ María José Pradas Ramo; «Robert (muñeco)».
Un resultado de buscador sobre un documento-lista no es una coincidencia hasta
ver el nombre en el texto.

## Veda electoral

`npm run freeze:status` antes de empezar. Con la veda LOREG activa no se ejecuta
el agente ni se promueve nada; el dossier puede seguir, la publicación no.
