import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
// Algunas redes (móviles, corporativas, con proxy) bloquean el canal de
// streaming que Firestore usa por defecto y lo hacen ver "offline" aunque
// haya internet. Forzamos long-polling, que es más compatible con esas redes.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// Uso personal, sin login: todo vive bajo un único espacio de trabajo.
const WORKSPACE = "principal";

export async function saveLibrary(mapping, plays) {
  await setDoc(doc(db, "workspaces", WORKSPACE, "meta", "library"), {
    mapping,
    plays,
  });
}

export async function loadLibrary() {
  const snap = await getDoc(doc(db, "workspaces", WORKSPACE, "meta", "library"));
  return snap.exists() ? snap.data() : null;
}

export async function loadCompilationIndex() {
  const snap = await getDocs(collection(db, "workspaces", WORKSPACE, "compilations"));
  const list = [];
  snap.forEach((d) => {
    const data = d.data();
    list.push({ id: d.id, title: data.title, year: data.year, createdAt: data.createdAt });
  });
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}

// El índice se deriva de los propios documentos de compilación, así que
// esta función no necesita hacer nada aparte — se mantiene por compatibilidad
// con el resto de la app.
export async function saveCompilationIndex() {
  return true;
}

export async function saveCompilation(comp) {
  await setDoc(doc(db, "workspaces", WORKSPACE, "compilations", comp.id), comp);
}

export async function loadCompilation(id) {
  const snap = await getDoc(doc(db, "workspaces", WORKSPACE, "compilations", id));
  return snap.exists() ? snap.data() : null;
}

export async function deleteCompilation(id) {
  await deleteDoc(doc(db, "workspaces", WORKSPACE, "compilations", id));
}
