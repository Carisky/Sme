# Instrukcja pracy z SilesDoc

## Czym jest ten program

`SilesDoc` to nazwa calej aplikacji. Po uruchomieniu najpierw widzisz ekran startowy z modulami. To nie jest blad i to nie jest dodatkowe okno. Tak ma dzialac program: najpierw wybierasz modul, potem zaczynasz prace.

W praktyce:

- `SilesDoc` -> program startowy, instalator, aktualizacje i ekran modulow;
- `SME` -> modul do korekt dokumentow, wydruku i PDF;
- `WCT CEN` -> modul do kontenerow i lookup `CEN` / `T-State` / `Stop`;
- `CEN IMTREKS` -> modul do rejestrow `IMTREKS`, lookup `T1` / `Status` / `Stop` oraz list `Do faktur`.

Wazne: `SME` nie jest juz nazwa calej aplikacji. `SME` jest teraz jednym z modulow uruchamianych z `SilesDoc`.

## Instalacja programu

1. Otworz instalator `SilesDoc Setup`.
2. W razie potrzeby wybierz folder instalacji.
3. Kliknij `Install`.
4. Poczekaj do konca. Instalator pokazuje rzeczywisty postep rozpakowywania.
5. Po instalacji program zazwyczaj uruchamia sie sam.

Jezeli program nie uruchomil sie sam:

- otworz skrot `SilesDoc` na pulpicie;
- albo znajdz `SilesDoc` w menu `Start`.

Najczesciej program instaluje sie tutaj:

- `C:\Users\Twoja_nazwa\AppData\Local\Programs\SilesDoc`

Dodatkowe okna `cmd` albo `PowerShell` zwykle nie powinny sie juz pojawiac przy instalacji i aktualizacji. Jezeli zobaczysz pojedyncze migniecie systemowe, nie jest to problem z programem.

## Co widac po uruchomieniu

Po starcie otwiera sie ekran glowny `SilesDoc` z kafelkami modulow.

Na kafelku modulu mozesz zobaczyc:

- `Otworz` -> modul jest gotowy do pracy;
- `Zainstaluj` -> modul trzeba najpierw pobrac i zainstalowac;
- `Aktualizuj` -> dla modulu jest nowsza wersja;
- `Otworz obecna` -> mozesz otworzyc juz zainstalowana wersje, nawet gdy czeka aktualizacja.

Na ekranie glownym sa tez:

- przycisk `Widocznosc modulow`, z ktorego ustawiasz, jakie kafelki maja byc widoczne;
- blok z wersja aplikacji i aktualizacja `SilesDoc`;
- pasek postepu aktualizacji aplikacji, kiedy trwa pobieranie nowej wersji;
- przycisk `Sprawdz ponownie`, gdy chcesz jeszcze raz sprawdzic wersje.

Jezeli nie widac potrzebnego modulu:

1. Kliknij `Widocznosc modulow`.
2. Sprawdz, czy modul nie jest ukryty.
3. Wlacz go z powrotem.
4. Zapisz widok.

## Jak aktualizowac cala aplikacje

Na ekranie glownym jest osobny blok dotyczacy samego `SilesDoc`.

Jezeli pojawi sie przycisk `Zaktualizuj aplikacje`, to znaczy, ze:

- jest nowsza wersja programu;
- albo biezaca kopia wymaga ponownej instalacji.

Co zrobic:

1. Kliknij `Zaktualizuj aplikacje`.
2. Poczekaj, az program pobierze instalator.
3. W czasie pobierania zobaczysz rzeczywisty procent postepu.
4. Po pobraniu otworzy sie instalator aktualizacji.
5. Zainstaluj aktualizacje.

W trakcie sprawdzania albo weryfikacji program moze pokazywac status bez procentu. To normalne. W czasie samego pobierania powinien byc widoczny procent.

W trakcie aktualizacji:

- `SilesDoc` moze sam sie zamknac;
- instalator pokazuje rzeczywisty postep rozpakowywania;
- po zakonczeniu program zwykle uruchamia sie sam;
- dodatkowe okna terminala zwykle nie powinny sie otwierac.

## Najprostszy schemat pracy

Najczesciej wyglada to tak:

1. Otwierasz `SilesDoc`.
2. Wybierasz potrzebny modul.
3. Importujesz plik albo otwierasz stary projekt.
4. Sprawdzasz dane.
5. W razie potrzeby dopisujesz cos recznie.
6. Zapisujesz.
7. Jezeli pracujesz w `SME`, przechodzisz do wydruku albo zapisu PDF.

## Modul SME

### Kiedy go otwierac

Otwieraj `SME`, jezeli potrzebujesz modulu do korekt dokumentow, przygotowania wydruku i zapisu PDF.

### Jak wejsc do modulu SME

1. Otworz `SilesDoc`.
2. Na ekranie modulow znajdz kafelek `SME`.
3. Kliknij `Otworz`.

[instruction1]

### Co jest w module

Na gorze sa glowne przyciski:

- `Moduly` -> powrot do ekranu startowego `SilesDoc`;
- `Nowy` -> nowy projekt;
- `Otworz` -> otwarcie zapisanego projektu;
- `Pobierz dane` -> import z Excela;
- `Zapisz` -> zapis biezacego projektu;
- `Zapisz jako` -> zapis kopii pod nowa nazwa;
- `Wydruk` -> przejscie do podgladu i druku.

Zakladki:

- `Dane` -> glowna praca z dokumentem;
- `Ustawienia` -> slowniki, dane naglowka, druk i PDF;
- `Wydruk` -> koncowa wersja dokumentu.

Na ekranie `Dane` widzisz:

- blok `Plik i import` z nazwa pliku i numerem kontrolnym;
- blok `Wprowadz dane dodatkowe`, gdzie uzupelniasz pola dokumentu;
- tabele `JEST` i `WINNO BYC`;
- przycisk `Pobierz dane` oraz przycisk `Oblicz`;
- sekcje `Uwagi po pobraniu danych` i `Walidacja`.

Najwazniejsze pola, ktore najczesciej uzupelniasz po prawej stronie:

- `Urzad celny`;
- `Data zgloszenia`;
- `Typ dokumentu`;
- `Numer MRN`;
- `Rodzaj rudy`;
- `Typ rudy`;
- `Kraj pochodzenia`;
- `Kod CN`.

[instruction2]

### Jak pracowac w SME od zera

1. Na ekranie glownym `SilesDoc` otworz `SME`.
2. Kliknij `Nowy`, jezeli zaczynasz nowy dokument.
3. Kliknij `Pobierz dane`.
4. Wybierz plik Excel.

[instruction6]

5. Po imporcie sprawdz, czy uzupelnily sie `Nazwa pliku`, `Nr kontrolny` i tabela `JEST`.
6. Uzupelnij dane w bloku `Wprowadz dane dodatkowe`.
7. W tabeli `WINNO BYC` wpisuj poprawione dane.
8. Najpierw uzupelnij `Numer noty` i `Data noty`, a dopiero potem zmieniaj cene albo numer faktury.
9. Kliknij `Oblicz`, jezeli chcesz od razu przeliczyc korekte i podglad.
10. Kliknij `Zapisz`.

Wazne:

- przycisk `Pobierz dane` jest widoczny na gornej belce i dodatkowo nad tabela `JEST`; mozesz uzyc dowolnego z nich;
- do wydruku przechodza tylko te linie z tabeli `WINNO BYC`, ktore maja komplet danych: `Numer noty` i `Data noty`;
- sekcja `Walidacja` pokazuje, czy dokument jest gotowy do dalszego kroku.

[instruction5]

### Co mozna ustawic w SME

W zakladce `Ustawienia` znajdziesz miedzy innymi:

- `Sciezki i projekt` -> lokalizacje pliku projektu;
- `Urzedy celne` -> slownik urzedow oraz przyciski `Nowy urzad` i `Zapisz urzad`;
- `Kraje pochodzenia` -> slownik krajow oraz przyciski `Nowy kraj` i `Zapisz kraj`;
- `Druk i PDF` -> opcje `Zapisuj PDF po wydrukowaniu` i `Folder PDF`;
- `Naglowek wydruku` -> miejscowosc, data wydruku, nadawca, adres, unikalny numer dokumentu i podpis.

[instruction3]

To jest miejsce, do ktorego wracasz, gdy trzeba poprawic dane do wydruku albo ustawic zapis PDF.

[instruction4]

### Jak otwierac stare projekty SME

1. Otworz modul `SME`.
2. Kliknij `Otworz`.
3. Wybierz zapisany plik projektu.

Wazne: projekt `SME` jest zapisywany jako osobny plik. To nie jest baza danych.

### Jak drukowac i zapisywac PDF

1. Otworz projekt.
2. Sprawdz, czy w tabeli `WINNO BYC` wszystkie potrzebne wiersze maja uzupelnione `Numer noty` i `Data noty`.
3. Kliknij zakladke albo przycisk `Wydruk`.

[instruction7]

4. Sprawdz podglad gotowego dokumentu.
5. Jezeli wszystko sie zgadza, kliknij `Drukuj`.
6. Jezeli chcesz wrocic do edycji, kliknij `Powrot`.

Podczas drukowania program pokazuje okno statusu druku:

- etap przygotowania dokumentu;
- liczbe stron;
- nazwe drukarki;
- postep wysylania do druku;
- status zapisu PDF, jezeli ta opcja jest wlaczona.

Jezeli chcesz po wydruku automatycznie zapisac PDF:

1. Otworz zakladke `Ustawienia`.
2. Wlacz `Zapisuj PDF po wydrukowaniu`.
3. Ustaw `Folder PDF`.
4. Zapisz projekt.
5. Drukuj normalnie.

[instruction8]

## Modul WCT CEN

### Kiedy go otwierac

Otwieraj `WCT CEN`, jezeli pracujesz z kontenerami i potrzebujesz:

- zaimportowac liste z Excela;
- uzupelniac `CEN`;
- uzupelniac `T-State`;
- uzupelniac `Stop`;
- dopisywac reczne rekordy do lokalnej bazy lookup.

### Co trzeba od razu zrozumiec

W `WCT CEN` projekt nie zapisuje sie jako osobny plik. Projekt jest trzymany w bazie danych pod nazwa projektu.

To znaczy:

- wybierasz baze;
- pracujesz w tej bazie;
- zapisujesz projekt pod nazwa;
- potem otwierasz go ponownie z tej samej bazy.

### Co jest w module

Przyciski na gorze:

- `Moduly`;
- `Nowy`;
- `Otworz`;
- `Importuj Excel`;
- `Zaktualizuj`;
- `Zapisz`;
- `Zapisz jako`.

Zakladki:

- `Dane`;
- `Ustawienia`.

W zakladce `Dane` znajdziesz:

- pole nazwy projektu z podpowiedziami;
- podsumowanie aktywnego pliku Excel i liczby wierszy;
- tabele robocza;
- przycisk `Dodaj wiersz`.

W zakladce `Ustawienia` znajdziesz:

- wybor bazy danych;
- formularz recznych rekordow `Container -> CEN / T-State / Stop`;
- wyszukiwarke i podglad slownika kontenerow.

### Jak pracowac w WCT CEN od zera

1. Otworz `WCT CEN` z ekranu `SilesDoc`.
2. Jezeli to pierwszy start, przejdz do `Ustawienia`.
3. Sprawdz sciezke do bazy.
4. W razie potrzeby kliknij `Wybierz baze`.
5. Wroc do `Dane`.
6. Kliknij `Importuj Excel`.
7. Wybierz plik.
8. Sprawdz wiersze.
9. W razie potrzeby dodaj albo popraw dane recznie.
10. Kliknij `Zaktualizuj`, aby uzupelnic lookup.
11. Kliknij `Zapisz`.

### Jak otwierac zapisane projekty WCT CEN

1. Otworz `WCT CEN`.
2. W polu nazwy projektu zacznij wpisywac nazwe.
3. Wybierz projekt z listy.
4. Kliknij `Otworz`.

### Jak dodawac reczne dane

Jezeli chcesz dodac wiersz do projektu:

1. Otworz `Dane`.
2. Kliknij `Dodaj wiersz`.
3. Uzupelnij wiersz.
4. Zapisz projekt.

Jezeli lookup nie znajduje rekordu kontenera:

1. Otworz `Ustawienia`.
2. Kliknij `Nowy rekord`.
3. Uzupelnij `Container Number`, `CEN`, `T-State`, `Stop`.
4. Kliknij `Zapisz rekord`.

### Gdzie znajduje sie baza WCT CEN

Domyslnie najczesciej tutaj:

- `C:\Users\Twoja_nazwa\AppData\Roaming\SME\wct_cen_db.sqlite`

Jezeli wskazesz inna baze, modul bedzie pracowal wlasnie na niej.

## Modul CEN IMTREKS

### Kiedy go otwierac

Otwieraj `CEN IMTREKS`, jezeli pracujesz z rejestrami `IMTREKS` i potrzebujesz uzupelniac:

- `T1`;
- `Status`;
- `Stop`;
- liste kontenerow `Do faktur`.

### Co odroznia ten modul

Ten modul pracuje na bazie danych i projekcie podzielonym na miesiace. Po imporcie mozesz miec kilka arkuszy miesiecznych, miedzy ktorymi sie przelaczasz.

### Co jest w module

Przyciski na gorze:

- `Moduly`;
- `Nowy`;
- `Otworz`;
- `Importuj Excel`;
- `Zaktualizuj`;
- `Zapisz`;
- `Zapisz jako`.

Zakladki:

- `Dane`;
- `Do faktur`;
- `Ustawienia`.

### Co znajdziesz w zakladce Dane

W `Dane` sa dostepne:

- przelaczanie miesiecy projektu;
- pasek postepu aktualizacji w samym module;
- wyszukiwanie po numerze kontenera;
- filtry po dacie statku, `T1`, `Status` i porownaniu z lista faktur;
- `Wyczysc filtry`;
- `Podswietli`, aby latwiej zobaczyc rekordy z porownania;
- `Przypisz fakture`, podglad faktury, `Akceptuj fakture` i `Cofnij podglad`;
- `Eksport`, aby zapisac widoczne wiersze;
- `Napraw T1`, aby wyczyscic niepoprawne wpisy;
- przelacznik `Force`;
- `Dodaj pusty`, aby dodac pusty wiersz roboczy.

### Co znajdziesz w zakladce Do faktur

Zakladka `Do faktur` sluzy do porownania kontenerow z projektu z osobna baza Excel.

Mozesz tam:

- zaimportowac baze porownawcza z Excela;
- wybrac arkusz i kolumne z kontenerami;
- filtrowac i sortowac porownanie;
- wyeksportowac liste kontenerow do dalszej pracy;
- wyczyscic baze porownawcza;
- zobaczyc, ktore kontenery sa juz w bazie, a ktore trafiaja do listy `Do faktur`.

### Co znajdziesz w zakladce Ustawienia

Tak samo jak w `WCT CEN`, znajdziesz tu:

- wybor bazy danych;
- reczne rekordy lookup;
- wyszukiwarke i podglad slownika kontenerow.

### Jak pracowac w CEN IMTREKS od zera

1. Otworz `CEN IMTREKS` z ekranu `SilesDoc`.
2. Jezeli to pierwszy start, otworz `Ustawienia`.
3. Sprawdz albo wybierz baze.
4. Wroc do `Dane`.
5. Kliknij `Importuj Excel`.
6. Wybierz plik.
7. Sprawdz miesiace i wiersze po imporcie.
8. W razie potrzeby ustaw filtry albo wyszukaj konkretny kontener.
9. Kliknij `Zaktualizuj`, aby uzupelnic brakujace dane.
10. Po sprawdzeniu kliknij `Zapisz`.

### Jak otwierac stare projekty CEN IMTREKS

1. Otworz `CEN IMTREKS`.
2. Zacznij wpisywac nazwe projektu.
3. Wybierz projekt z listy.
4. Kliknij `Otworz`.

### Co robic, gdy aktualizacja trwa dlugo

To normalne. W `CEN IMTREKS` aktualizacja moze chwile potrwac.

W czasie aktualizacji:

- widzisz status i procent postepu;
- dane moga uzupelniac sie stopniowo;
- przycisk aktualizacji moze przejsc w tryb anulowania;
- po anulowaniu czesciowe zmiany sa odrzucane.

### Kiedy uzywac Force

Tryb zwykly:

- modul uzupelnia glownie puste pola.

Tryb `Force`:

- modul probuje odswiezyc rowniez pola juz uzupelnione.

Uzywaj `Force` tylko wtedy, kiedy chcesz nadpisac to, co juz jest.

### Kiedy uzywac Napraw T1

Uzyj `Napraw T1`, jezeli w bazie albo w projekcie pojawily sie niepoprawne wartosci `T1`. Funkcja czysci wpisy, ktore nie pasuja do oczekiwanego wzorca.

### Jak pracowac z lista Do faktur

Najprostszy scenariusz:

1. Zaimportuj projekt.
2. Przejdz do `Do faktur`.
3. Kliknij `Importuj baze Excel`.
4. Wybierz arkusz i kolumne z kontenerami.
5. Sprawdz statystyki `W bazie porownawczej` i `Do faktur`.
6. W razie potrzeby kliknij `Eksportuj liste`.

### Gdzie znajduje sie baza CEN IMTREKS

Domyslnie najczesciej tutaj:

- `C:\Users\Twoja_nazwa\AppData\Roaming\SME\cen_imtreks_db.sqlite`

Jezeli wskazesz inny plik bazy, modul bedzie pracowal na nim.

## Gdzie program i dane sa zapisane

### Gdzie lezy sama aplikacja

Najczesciej tutaj:

- `C:\Users\Twoja_nazwa\AppData\Local\Programs\SilesDoc`

### Gdzie leza wspolne dane aplikacji

Najczesciej tutaj:

- `C:\Users\Twoja_nazwa\AppData\Roaming\SME`

Wazne: folder danych nadal nazywa sie `SME`. To jest celowe i zostalo zostawione dla zgodnosci ze starszymi wersjami.

### Co zwykle jest w AppData\Roaming\SME

Najczesciej:

- wspolna baza ustawien;
- baza `WCT CEN`;
- baza `CEN IMTREKS`;
- zainstalowane dodatkowe moduly.

### Gdzie sa projekty SME

Projekty `SME` sa tam, gdzie sam je zapiszesz.

### Gdzie sa projekty WCT CEN i CEN IMTREKS

Sa zapisane wewnatrz swoich baz danych:

- `WCT CEN` -> w bazie `wct_cen_db.sqlite`;
- `CEN IMTREKS` -> w bazie `cen_imtreks_db.sqlite`.

## Co klikac w typowych sytuacjach

### Jezeli chcesz zaczac od zera

1. Otworz `SilesDoc`.
2. Wybierz modul.
3. Kliknij `Nowy`.
4. Zaimportuj plik albo wpisz dane recznie.

### Jezeli chcesz wrocic do starej pracy

1. Otworz odpowiedni modul.
2. W `SME` kliknij `Otworz` i wybierz plik.
3. W `WCT CEN` albo `CEN IMTREKS` wpisz nazwe projektu i kliknij `Otworz`.

### Jezeli chcesz zapisac wynik

- w `SME` zapisujesz osobny plik;
- w `WCT CEN` zapisujesz projekt do bazy;
- w `CEN IMTREKS` zapisujesz projekt do bazy.

### Jezeli chcesz wrocic do ekranu modulow

W module kliknij `Moduly`.

## Jezeli cos poszlo nie tak

### Nie widac modulu

- sprawdz `Widocznosc modulow`;
- jezeli na kafelku jest `Zainstaluj`, najpierw zainstaluj modul;
- jezeli na kafelku jest `Aktualizuj`, zaktualizuj modul albo otworz obecna wersje przez `Otworz obecna`.

### Nie da sie sprawdzic aktualizacji aplikacji

- kliknij `Sprawdz ponownie`;
- sprawdz polaczenie z internetem;
- jezeli program pokazuje, ze pracuje na ostatniej potwierdzonej wersji lokalnej, mozesz dalej pracowac, ale bez pobrania nowej wersji.

### W WCT CEN albo CEN IMTREKS nie ma projektu

- upewnij sie, ze wybrana jest wlasciwa baza;
- sprawdz nazwe projektu;
- jezeli wybrana byla zla baza, przelacz ja i sproboj ponownie.

### Lookup nic nie znajduje

- sprawdz internet;
- sprawdz numer kontenera;
- dodaj rekord recznie przez `Ustawienia`, jezeli lookup nadal nic nie znajduje.

### Nie mozesz znalezc plikow programu

Zwykle trzeba patrzec w dwa miejsca:

- aplikacja -> `AppData\Local\Programs\SilesDoc`;
- dane robocze -> `AppData\Roaming\SME`.

## Najwazniejsze w skrocie

- `SilesDoc` to cala aplikacja i launcher modulow.
- `SME` to modul do dokumentow, wydruku i PDF.
- `WCT CEN` zapisuje projekty w bazie `wct_cen_db.sqlite`.
- `CEN IMTREKS` zapisuje projekty w bazie `cen_imtreks_db.sqlite` i ma dodatkowa zakladke `Do faktur`.
- Aktualizacja aplikacji pokazuje rzeczywisty postep pobierania.
- Instalator `SilesDoc Setup` pokazuje rzeczywisty postep instalacji.
- Dane wspolne nadal sa w folderze `AppData\Roaming\SME`.
