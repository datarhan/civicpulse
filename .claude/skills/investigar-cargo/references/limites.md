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

### Qué cuenta como primera llave (el documento del parentesco)

- Una **abstención con motivo** en un acta de pleno o de Junta de Gobierno —«por
  parentesco», «por interés directo», art. 23 de la Ley 40/2015—: la más fuerte,
  porque la escribe el propio Ayuntamiento y va atada a un expediente concreto.
- Las **palabras del propio cargo**: su currículum, sus cuentas públicas, una
  entrevista («la empresa familiar», «mi hijo»). Se cita `selfDeclared`.
- **Prensa que nombre el vínculo**, publicada como «según <medio>, <fecha>».
- Una **candidatura compartida** o una esquela son indicios débiles: sirven para
  buscar el documento, no lo sustituyen.
- **Nunca** dos apellidos compartidos: ni en el BORME, ni en un adjudicatario, ni
  en un padrón. Tampoco una foto, una red social ajena ni un buscador de personas.

### Del expediente a la persona, nunca al revés

El entorno de un cargo no se investiga levantando fichas de sus parientes —son
particulares— sino partiendo de lo que ya es público por ser del Ayuntamiento: los
adjudicatarios, los beneficiarios de subvención, las personas nombradas en un
edicto o en una licencia. Para cada sociedad, el BORME dice quién la administra o
apodera; sólo entonces se pregunta si alguien de ahí es el propio cargo, un
familiar con llave o alguien que comparte sus dos apellidos (una pista que obliga a
buscar el documento, no un hallazgo). `npm run journalist:entorno` hace
exactamente ese recorrido y escribe sólo bajo `editorial/`; una persona que no
consta en ningún expediente municipal no aparece con nombre en ninguna parte,
tampoco en el fichero privado: si comparte apellidos, se cuenta; no se nombra.

Quien acaba nombrado por su parentesco tiene el mismo derecho de réplica que el
cargo, y la frase que lo nombra lleva su documento y su nexo al lado.

Patrimonio: sólo lo que un documento público diga (declaraciones, BORME, BOP,
BOE, actas, licencias de obra y PAIs que nombren al titular). Nunca inferido de
fotos, de redes ni de un buscador de inmuebles. Lo que las vías gratuitas NO dan,
y no se finge: la propiedad (el BORME publica cargos, no socios; el Registro de la
Propiedad y el de Bienes Muebles son de pago y exigen interés; Catastro no busca
por titular). Un «lujo» sólo entra cuando un acto público lo nombra —una licencia a
nombre de un familiar, una reclasificación que beneficia a una parcela cuyo titular
lista un PAI—, y entonces con sus dos llaves.

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
