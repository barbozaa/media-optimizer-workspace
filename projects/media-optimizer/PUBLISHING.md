# Guía de Publicación - @ngx-core/media-optimizer

## 📋 Pre-requisitos

1. Cuenta en [npmjs.com](https://www.npmjs.com/)
2. npm CLI autenticado: `npm login`
3. Código testeado y sin errores

## 🔨 Construir la Librería

```bash
# Construir la librería
npm run build:lib

# La salida estará en: dist/media-optimizer/
```

## ✅ Verificar la Build

```bash
cd dist/media-optimizer
ls -la

# Deberías ver:
# - package.json
# - README.md
# - *.d.ts (archivos de tipos)
# - *.js (código compilado)
# - *.metadata.json
```

## 📦 Probar Localmente

### Opción 1: npm pack

```bash
# Crear un tarball
npm run pack:lib

# Instalar en otro proyecto
cd /path/to/otro-proyecto
npm install /path/to/myApp/dist/media-optimizer/ngx-utils-media-optimizer-1.0.0.tgz
```

### Opción 2: npm link

```bash
# En la carpeta de la librería
cd dist/media-optimizer
npm link

# En tu proyecto de prueba
cd /path/to/otro-proyecto
npm link @ngx-core/media-optimizer
```

## 🚀 Publicar a npm

### Primera Publicación

```bash
cd dist/media-optimizer

# Verificar que todo esté correcto
npm publish --dry-run

# Publicar (requiere autenticación)
npm publish --access public
```

### Actualizar Versión

1. **Actualizar versión en `projects/media-optimizer/package.json`**

```json
{
  "version": "1.0.1"  // Incrementar según semver
}
```

2. **Reconstruir y publicar**

```bash
npm run build:lib
cd dist/media-optimizer
npm publish
```

## 📝 Versionado (Semantic Versioning)

- **MAJOR** (1.x.x): Cambios incompatibles con versiones anteriores
- **MINOR** (x.1.x): Nueva funcionalidad compatible hacia atrás
- **PATCH** (x.x.1): Corrección de bugs compatible hacia atrás

Ejemplos:
```bash
# Bug fix
1.0.0 -> 1.0.1

# Nueva feature
1.0.1 -> 1.1.0

# Breaking change
1.1.0 -> 2.0.0
```

## 🏷️ Tags Git

```bash
# Crear tag
git tag -a v1.0.0 -m "Release v1.0.0"

# Push tag
git push origin v1.0.0

# Listar tags
git tag -l
```

## ✨ Checklist de Publicación

- [ ] Tests pasando (`npm run test:lib`)
- [ ] Build exitoso (`npm run build:lib`)
- [ ] README.md actualizado
- [ ] CHANGELOG.md actualizado
- [ ] Versión actualizada en package.json
- [ ] Código commiteado y pusheado
- [ ] Tag de git creado
- [ ] `npm publish --dry-run` exitoso
- [ ] Publicado a npm
- [ ] Verificado en npmjs.com

## 🔧 Troubleshooting

### Error: "Package already exists"

```bash
# Incrementar la versión en package.json
"version": "1.0.1"
```

### Error: "Unauthorized"

```bash
# Login a npm
npm login

# Verificar usuario
npm whoami
```

### Error: "Package name too similar"

```bash
# Cambiar el nombre en package.json a algo único
"name": "@tu-username/media-optimizer"
```

## 📊 Después de Publicar

1. **Verificar en npm**
   - https://www.npmjs.com/package/@ngx-core/media-optimizer

2. **Instalar en proyecto de prueba**
```bash
npm install @ngx-core/media-optimizer
```

3. **Compartir**
   - Actualizar README con badges
   - Crear release en GitHub
   - Anunciar en redes sociales

## 📦 Uso en Proyectos

Una vez publicado, cualquiera puede instalarlo:

```bash
npm install @ngx-core/media-optimizer
```

```typescript
import { ImageConverterService } from '@ngx-core/media-optimizer';
```

## 🔄 Flujo de Desarrollo

```bash
# 1. Hacer cambios en projects/media-optimizer/
# 2. Correr tests
npm run test:lib

# 3. Build
npm run build:lib

# 4. Probar localmente con npm link

# 5. Actualizar versión

# 6. Publicar
cd dist/media-optimizer
npm publish
```

---

**¡Listo!** Tu librería está disponible para todo el mundo en npm. 🎉
