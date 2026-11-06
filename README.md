# Kindly Reminder

Desktopowy timer skupienia zbudowany dla TinyJS. Okno ustawień uruchamia sesję, a następnie chowa się do zasobnika systemowego. Przypomnienia otwierają osobne okno na wierzchu, u góry i na środku aktywnego ekranu. Ustawienia i aktywna sesja są zapisywane lokalnie. Ikona aplikacji dla menu i pliku `.dmg` znajduje się w `assets/icon.png`.

## Uruchomienie

Wymaga zainstalowanego [TinyJS](https://tinyjs.app/docs/install). W katalogu projektu uruchom:

```sh
tinyjs dev
```

Te same czynności są dostępne przez `make dev`, `make build` i `make dmg`. `make install` buduje DMG, kopiuje aplikację do `/Applications` i prosi o hasło administratora, jeśli macOS go wymaga. Po instalacji aplikację można uruchamiać przez Spotlight.

## Uruchamianie bez instalacji

Uruchom `make dev`, aby wystartować aplikację bezpośrednio z projektu, albo `make run`, aby zbudować i uruchomić lokalny plik wykonywalny z `dist/`. Te polecenia nie tworzą DMG ani nie kopiują aplikacji do `/Applications`. Jeśli firmowe zasady blokują także uruchamianie lokalnych aplikacji, poproś IT o zatwierdzony sposób uruchomienia.

Budowa aplikacji:

```sh
tinyjs build
```

Gotowy obraz instalacyjny macOS z ikoną aplikacji:

```sh
make dmg
```

Zamknięcie głównego okna chowa aplikację do zasobnika. Sesję można zakończyć z głównego okna lub z menu ikony zasobnika.

## Ograniczenia systemowe

Utrzymywanie popupu nad innymi aplikacjami zależy od systemu okien. TinyJS obsługuje poziom `floating`; macOS, Windows i X11 mogą wyświetlać go nad zwykłymi oknami. Wayland nie pozwala aplikacjom samodzielnie ustawiać poziomu ani pozycji okien, więc w takim środowisku popup może nie pojawić się na wierzchu.
