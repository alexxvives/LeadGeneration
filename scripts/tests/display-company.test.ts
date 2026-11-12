/**
 * Conservative short-brand cleaner for outreach subject/greeting.
 *
 * Run: npx esbuild scripts/tests/display-company.test.ts --bundle --platform=node --format=esm \
 *   --tsconfig=tsconfig.json --external:node:* --outfile=/tmp/display-company.test.mjs && node /tmp/display-company.test.mjs
 */
import assert from "node:assert/strict";
import {
  displayCompanyName,
  rewriteSubjectAndGreeting,
} from "@/lib/outreach/display-company";

function check(company: string, website: string | null, expected: string) {
  const got = displayCompanyName(company, website);
  assert.equal(got, expected, `${company}\n  expected ${expected}\n  got      ${got}`);
}

check(
  "Academia de inglés en Barcelona Callan School of English",
  "https://www.callanschool.info/",
  "Callan School",
);
check(
  "Colegio Sagrado Corazón. Plaza Madre María Ana Mogas",
  "https://anamogas.org",
  "Colegio Sagrado Corazón",
);
check(
  "Colegio Fomento Fundación. Calle Padre Claret",
  "https://www.fomento.edu",
  "Colegio Fomento Fundación",
);
check(
  "Escuela Técnica Superior de Arquitectura",
  "https://arquitectura.upc.edu",
  "Escuela Técnica Superior de Arquitectura",
);
check(
  "International Coaching Community Academy",
  "https://academy.internationalcoachingcommunity.com/",
  "International Coaching Community Academy",
);
check(
  "Formación profesional Comunidad de Madrid",
  "https://comunidad.madrid",
  "Formación profesional Comunidad de Madrid",
);
check(
  "Escuela Family Evolution. Serxio Lemos",
  null,
  "Escuela Family Evolution. Serxio Lemos",
);
check(
  "Secretarios Junta Castilla y León 2025",
  null,
  "Secretarios Junta Castilla y León 2025",
);
check(
  "San Francisco Javier - La Salle Virlecha",
  null,
  "San Francisco Javier - La Salle Virlecha",
);
check("Formations en e-learning", null, "Formations en e-learning");
check("Area E-learning", null, "Area E-learning");
check(
  "International Institute of Genealogical Studies",
  "https://genealogicalstudies.com",
  "International Institute of Genealogical Studies",
);
check(
  "Escuela de Equitación de la Real Maestranza de Caballería de Ronda",
  "https://ronda.realmaestranza.org",
  "Escuela de Equitación de la Real Maestranza de Caballería de Ronda",
);
check(
  "Aule virtuali di Accademia Britannica di Perugia",
  "https://aulevirtuali.accademiabritannica.it",
  "Aule virtuali di Accademia Britannica di Perugia",
);
check(
  "Inclusive Camino de Santiago Journey Blueprint",
  "https://journeyblueprint.com",
  "Inclusive Camino de Santiago Journey Blueprint",
);
check(
  "UNEP Special Programme Elearning Platform",
  null,
  "UNEP Special Programme Elearning Platform",
);
check(
  "Academy Formazione Training Community",
  null,
  "Academy Formazione Training Community",
);
check(
  "Grand Encampment of Knights Templar - Education",
  null,
  "Grand Encampment of Knights Templar - Education",
);
check(
  "Associazione Nuova Terra - Istituto Bioenergia",
  null,
  "Associazione Nuova Terra - Istituto Bioenergia",
);
check("BK Online", null, "BK Online");
check(
  "Elearning - Plateforme by Askott",
  null,
  "Elearning - Plateforme by Askott",
);
check("Dra. Barriga | Academia Central", null, "Dra. Barriga | Academia Central");
check(
  "Yes La Academia Academia de Idiomas en Madrid - Tetuán",
  null,
  "Yes La Academia",
);
check("Babilum Academia de idiomas en Madrid", null, "Babilum");
check(
  "Inglaterra en Casa - Academia de inglés en Valencia",
  null,
  "Inglaterra en Casa",
);
check("Clarendon College Online", null, "Clarendon College");
check(
  "London College For Corporate Learning Limited",
  null,
  "London College For Corporate Learning",
);
check(
  "Amalia i José Perruquers Ambisex S.L",
  null,
  "Amalia i José Perruquers Ambisex",
);
check("Edmotion Inc", null, "Edmotion");
check(
  "Cambridge International School of English",
  null,
  "Cambridge International School",
);
check(
  "ECOGNITIO - Escuela Internacional de Conocimiento Agroambiental",
  null,
  "ECOGNITIO",
);
check(
  "Royal College of General Practitioners - Online Learning Environment",
  null,
  "Royal College of General Practitioners",
);
check(
  "Safe Easy srl - Salute e Sicurezza sui luoghi di lavoro e Sistema HACCP",
  null,
  "Safe Easy",
);
check(
  "CertAI.org Global AI Education and Certification - An independent organization focused on the essence of artificial intelligence and deep principled understanding",
  null,
  "CertAI.org Global AI Education and Certification",
);
check(
  "ESCUELA DE FORMACIÓN DEPORTIVA ALÚA",
  null,
  "Escuela de Formación Deportiva ALÚA",
);
check("ACADEMIA YAGUE", null, "Academia Yague");
check(
  "PPL A - H - VDS - QUIZ LICENZA DI PILOTA PRIVATO",
  null,
  "PPL A - H - VDS - QUIZ LICENZA DI PILOTA PRIVATO",
);
check(
  "Aliste formación - Campus Online",
  null,
  "Aliste formación - Campus Online",
);
check(
  "GPS Seminary and Institute of Chaplaincy",
  "https://www.gpsseminary.org/moodle",
  "GPS Seminary and Institute of Chaplaincy",
);
check(
  "Formación Profesional Iundenia Huercal-Overa",
  "https://iundenia.com",
  "Formación Profesional Iundenia Huercal-Overa",
);
check(
  "Asociación Cultural Educativa A.C.E.L.",
  null,
  "Asociación Cultural Educativa A.C.E.L.",
);
check("Formación del P.A.S.", null, "Formación del P.A.S.");
check("Colegio Esclavas S.C.J.", null, "Colegio Esclavas S.C.J.");
check(
  "Estualia -Academia de inglés y centro formador online",
  "https://campusvirtual.estualia.es/",
  "Estualia",
);
check(
  "Halligan Formación - Aula Virtual - Academia Bomberos",
  "https://aula.halligan.es/",
  "Halligan Formación",
);
check(
  "Curva Polar Escuela Superior de Imagen y Sonido",
  "https://www.curvapolar.es",
  "Curva Polar",
);
check(
  "Centro de Formación Personas en Positivo",
  "https://formacion.personasenpositivo.com/",
  "Personas en Positivo",
);
check("IESTP UTCUBAMBA", null, "Iestp Utcubamba");
check("ALTER EGO FORMATION", null, "Alter Ego Formation");
check("BATIPRO ON LINE", null, "BATIPRO");
check("EVALUATION HAS FILDARGENT", null, "Evaluation has Fildargent");
check(
  "Plate-forme d Enseignement de l Université de Nantes",
  null,
  "Plate-forme d Enseignement de l Université de Nantes",
);
check(
  "Ecole nationale vétérinaire et agro-alimentaire de Nantes Oniris - Formation professionnelle continue.",
  null,
  "Ecole nationale vétérinaire et agro-alimentaire de Nantes Oniris",
);
check(
  "Campus Asociación Huella de Carbono-Cursos de Sostenibilidad y Gestión de tu huella de carbono",
  null,
  "Campus Asociación Huella de Carbono",
);

const rewritten = rewriteSubjectAndGreeting(
  "Propuesta para Academia de inglés en Barcelona Callan School of English",
  "Buenas\u00a0Academia de inglés en Barcelona Callan School of English!<br><br>Cuerpo",
  "Academia de inglés en Barcelona Callan School of English",
  "Callan School",
);
assert.deepEqual(rewritten, {
  subject: "Propuesta para Callan School",
  body: "Buenas\u00a0Callan School!<br><br>Cuerpo",
});
assert.equal(
  rewriteSubjectAndGreeting("Propuesta para Same", "Buenas\u00a0Same!", "Same", "Same"),
  null,
);

console.log("display-company tests passed");
