# Cómo conectar la app a Firebase (gratis, plan Spark)

La app usa una capa de datos mínima (`Data` en `app.js`) con tres tablas en memoria:
`users`, `sessions` y `attendance`. En el prototipo se guardan en **LocalStorage**
(sirve para probar en un solo navegador). Para que profesor y alumnos compartan los
mismos datos desde sus celulares necesitas un backend: **Firebase** es la opción
gratuita más sencilla.

## 1. Crear el proyecto

1. Entra a https://console.firebase.google.com → **Agregar proyecto**.
2. En **Compilación → Authentication → Método de acceso**, activa **Correo/contraseña**.
3. En **Compilación → Firestore Database**, crea la base en modo producción.
4. En **Configuración del proyecto → Tus apps → Web (</>)**, registra la app y copia el `firebaseConfig`.

## 2. Cargar el SDK (sin frameworks)

En `index.html`, cambia la etiqueta del script para usar módulos ES:

```html
<script type="module" src="app.js"></script>
```

Y al inicio de `app.js`:

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app = initializeApp({ /* pega aquí tu firebaseConfig */ });
const auth = getAuth(app);
const db = getFirestore(app);
```

## 3. Sustituir la capa de datos

Mantén `Data.state` como caché local (así el resto del código no cambia) y
sincronízala con Firestore:

```js
// Lectura en tiempo real: cada colección actualiza la caché y vuelve a renderizar
['users', 'sessions', 'attendance'].forEach((name) => {
  onSnapshot(collection(db, name), (snap) => {
    Data.state[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  });
});

// Escritura: en lugar de guardar todo en LocalStorage, guarda el documento que cambió
async function saveDoc(name, obj) { await setDoc(doc(db, name, obj.id), obj); }
async function removeDoc(name, id) { await deleteDoc(doc(db, name, id)); }
```

Reemplaza cada `Data.save()` por el `saveDoc` / `removeDoc` correspondiente
(por ejemplo, al marcar asistencia: `saveDoc('attendance', registro)`).

### Autenticación

- **Registro:** `createUserWithEmailAndPassword(auth, correo, password)` y guarda
  nombre, matrícula y rol `estudiante` en `users/{uid}`. Con esto ya no guardas
  contraseñas ni hashes tú mismo (elimina `passHash` y `hashPassword`).
- **Login:** `signInWithEmailAndPassword(auth, correo, password)` (si quieres login por
  matrícula, busca primero el correo en `users`).
- **Sesión:** `onAuthStateChanged(auth, ...)` reemplaza a `SESSION_KEY`.
- **Profesor:** crea su cuenta en la consola de Firebase y asigna `rol: 'admin'` a su documento en `users`.

## 4. Reglas de seguridad de Firestore (importante)

Sin reglas, cualquiera podría modificar datos. Punto de partida:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function esAdmin() {
      return get(/databases/$(db)/documents/users/$(request.auth.uid)).data.rol == 'admin';
    }
    match /users/{id} {
      allow read: if request.auth != null && (esAdmin() || request.auth.uid == id);
      allow create: if request.auth.uid == id && request.resource.data.rol == 'estudiante';
      allow update, delete: if esAdmin();
    }
    match /sessions/{id} {
      allow read: if request.auth != null;
      allow write: if esAdmin();
    }
    match /attendance/{id} {
      allow read: if request.auth != null &&
        (esAdmin() || resource.data.userId == request.auth.uid);
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid
        && request.resource.data.estado == 'asistencia';
      allow update, delete: if esAdmin();
    }
  }
}
```

> **Limitación del prototipo:** con LocalStorage (y también con las reglas de arriba)
> la validación del código ocurre en el navegador, así que un alumno técnico podría
> saltársela. Para blindarla, valida el PIN en una **Cloud Function** o guarda el PIN
> activo en un documento al que solo el profesor tenga acceso y verifica la hora de
> expiración en las reglas / función del servidor.

## 5. Publicar gratis

`firebase init hosting` → `firebase deploy`, o súbelo a GitHub Pages / Netlify.
Firebase Hosting entrega HTTPS, necesario para que los celulares usen `crypto` sin problemas.
