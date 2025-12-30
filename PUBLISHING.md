# 📦 Guía de Publicación a NPM

## ✅ Estado Actual

### Tests ✅
- **82/82 pruebas pasando** 
- 100% de cobertura en funciones principales
- Tests de integración y unitarios completos

### Build ✅
- Librería compilada exitosamente
- `browser-image-compression` bundleado correctamente (59KB)
- Source maps generados
- TypeScript declarations incluidas

### Package ✅
- Paquete: `ngx-core-media-optimizer-1.0.0.tgz` (87.1 KB)
- Ubicación: `/home/barboza/Documents/workspace/media-optimizer-workspace/dist/media-optimizer/`
- Contenido verificado:
  - ✓ LICENSE
  - ✓ README.md
  - ✓ package.json (con autor actualizado)
  - ✓ Código compilado (fesm2022)
  - ✓ Type definitions
  - ✓ Source maps

---

## 🚀 Pasos para Publicar a NPM

### 1. Verificar cuenta de NPM

```bash
# Login a NPM (si no lo has hecho)
npm login

# Verificar que estás logueado
npm whoami
```

### 2. Probar el paquete localmente (Opcional)

```bash
cd /home/barboza/Documents/workspace/media-optimizer-workspace

# Instalar en myApp para prueba final
cd ../myApp
npm install ../media-optimizer-workspace/dist/media-optimizer/ngx-core-media-optimizer-1.0.0.tgz
```

### 3. Publicar a NPM

```bash
cd /home/barboza/Documents/workspace/media-optimizer-workspace/dist/media-optimizer

# Publicar como scoped package público
npm publish --access public
```

### 4. Verificar publicación

```bash
# Verificar en NPM
npm view @ngx-core/media-optimizer

# Instalar desde NPM
npm install @ngx-core/media-optimizer
```

---

## 📋 Checklist Pre-Publicación

- [x] Todas las pruebas pasan (82/82)
- [x] Build sin errores
- [x] `browser-image-compression` correctamente bundleado
- [x] Package.json con información correcta
- [x] README.md completo y actualizado
- [x] LICENSE incluida
- [x] Type definitions generadas
- [x] Source maps incluidas
- [x] Versión: 1.0.0

---

## 📝 Notas Importantes

### Dependencias Bundleadas
La librería incluye `browser-image-compression` en el bundle final, por lo que los usuarios **NO necesitan instalarla por separado**.

### Compatibilidad Angular
Compatible con Angular 18, 19, 20 y 21.

### Peer Dependencies
Solo requiere `@angular/core` y `@angular/common` (que cualquier app Angular ya tiene).

### Tamaños
- **Package size**: 87.1 KB (comprimido)
- **Unpacked size**: 297.7 KB
- **Bundle final**: ~60 KB (minificado)

---

## 🔄 Versiones Futuras

Para publicar actualizaciones:

```bash
cd /home/barboza/Documents/workspace/media-optimizer-workspace/projects/media-optimizer

# Actualizar versión en package.json
npm version patch  # 1.0.1
# o
npm version minor  # 1.1.0
# o
npm version major  # 2.0.0

# Rebuild y publicar
cd ../..
npm run pack:lib
cd dist/media-optimizer
npm publish --access public
```

---

## 🐛 Troubleshooting

### Error: "Package name too similar to existing package"
Si el nombre `@ngx-core/media-optimizer` ya existe, considera:
- `@barboza/media-optimizer`
- `@your-username/ngx-media-optimizer`
- `ngx-media-optimizer` (sin scope)

### Error: "You must verify your email"
Verifica tu email en npmjs.com antes de publicar.

### Error: "You do not have permission to publish"
Asegúrate de tener permisos en el scope `@ngx-core` o usa un scope diferente.

---

## ✨ Post-Publicación

1. **Crear Release en GitHub** (si tienes repositorio)
2. **Actualizar badges en README** con versión real
3. **Compartir en redes sociales** o comunidad Angular
4. **Monitorear issues** en GitHub
5. **Responder preguntas** en npm/GitHub

---

## 📊 Comandos Útiles

```bash
# Ver información del paquete publicado
npm info @ngx-core/media-optimizer

# Ver descargas
npm info @ngx-core/media-optimizer downloads

# Ver versiones publicadas
npm view @ngx-core/media-optimizer versions

# Deprecar una versión
npm deprecate @ngx-core/media-optimizer@1.0.0 "Use 1.0.1 instead"

# Quitar publicación (solo primeras 72 horas)
npm unpublish @ngx-core/media-optimizer@1.0.0
```

---

**¡Buena suerte con tu publicación! 🎉**
