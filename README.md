# Jurnal Nutriție

Aplicație Android/PWA pentru:
- calorii și macro-uri;
- fibre;
- greutate;
- pași;
- zi 00:00–00:00;
- țintă inițială 1800 kcal;
- salvare locală offline;
- sincronizare Supabase după autentificare email;
- Android Health Connect: se trimite în cloud doar totalul zilnic de pași.

## Pornire web
```bash
npm install
npm run dev
```

## Build Android local
```bash
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```
APK-ul rezultat este în `android/app/build/outputs/apk/debug/app-debug.apk`.

## Build APK în GitHub Actions
Workflow-ul `.github/workflows/build-apk.yml` poate construi automat APK-ul după ce proiectul este încărcat într-un repository GitHub. APK-ul apare la Actions > ultimul build > Artifacts.

## Siguranță
Cheia inclusă este cheia *publishable* Supabase, destinată aplicațiilor client. Nu este inclusă nicio cheie service-role.
