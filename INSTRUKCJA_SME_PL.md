# Instrukcja pracy z SME

## Do czego jest ten program

Po uruchomieniu widzisz ekran startowy z modułami. To nie jest błąd i to nie jest "dodatkowe okno". Program działa właśnie tak: najpierw wybierasz moduł, potem zaczynasz pracę.

Jeżeli potrzebujesz:

- robić korekty dokumentów i drukować gotowy dokument -> otwórz `SME`;
- pracować z kontenerami i uzupełniać `CEN`, `T-State`, `Stop` -> otwórz `WCT CEN`;
- pracować z rejestrami `IMTREKS` i uzupełniać `T1`, `Status`, `Stop` -> otwórz `CEN IMTREKS`.

## Instalacja programu

1. Otwórz instalator `SME` (SME-Setup).
2. Kliknij Install.
3. Poczekaj do końca.
4. Po instalacji program zazwyczaj uruchamia się sam.

Jeżeli program nie uruchomił się sam:

- otwórz skrót `SME` na pulpicie;
- albo znajdź `SME` w menu `Start`.

Najczęściej program instaluje się tutaj:

- `C:\Users\Twoja_nazwa\AppData\Local\Programs\SME`

To jest zwykły folder instalacyjny. Zwykle nie trzeba tam nic robić ręcznie.

## Co widać po uruchomieniu

Po starcie otwiera się ekran główny z kafelkami modułów.

Na kafelku najczęściej jest przycisk:

- `Otwórz` -> moduł jest już gotowy do pracy, po prostu go otwórz;
- `Zainstaluj` -> moduł nie jest jeszcze zainstalowany, najpierw kliknij ten przycisk;
- `Aktualizuj` -> moduł już jest, ale dostępna jest nowsza wersja.

Jeżeli chcesz po prostu otworzyć moduł:

1. Znajdź jego kafelek.
2. Kliknij `Otwórz`.

Jeżeli moduł nie jest jeszcze zainstalowany:

1. Kliknij `Zainstaluj`.
2. Poczekaj do końca.
3. Potem kliknij `Otwórz`.

Jeżeli dla modułu jest aktualizacja:

1. Kliknij `Aktualizuj`.
2. Poczekaj do końca.
3. Potem otwórz moduł normalnie.

Jeżeli nie widać potrzebnego modułu:

1. Kliknij `Widoczność modułów`.
2. Sprawdź, czy moduł nie jest ukryty.
3. Włącz go z powrotem.
4. Zapisz widok.

## Jeżeli trzeba zaktualizować cały program

Na ekranie głównym jest osobny blok z informacją o wersji programu.

Jeżeli pojawił się tam przycisk `Zaktualizuj aplikację`, to znaczy:

- wyszła nowa wersja;
- albo program prosi o ponowną instalację bieżącej wersji.

Co zrobić:

1. Kliknij `Zaktualizuj aplikację`.
2. Poczekaj, aż program pobierze aktualizację.
3. Poczekaj, aż otworzy się instalator.
4. Zainstaluj aktualizację.

W trakcie tego procesu program może sam się zamknąć. To normalne.

## Najprostszy schemat pracy

W skrócie najczęściej wygląda to tak:

1. Otwierasz program.
2. Wybierasz potrzebny moduł.
3. Importujesz plik albo otwierasz stary projekt.
4. Sprawdzasz dane.
5. W razie potrzeby dopisujesz coś ręcznie.
6. Zapisujesz.
7. Jeżeli to `SME` -> przechodzisz do wydruku i drukujesz albo zapisujesz PDF.

## Moduł SME

### Kiedy go otwierać

Otwieraj `SME`, jeżeli potrzebujesz głównego modułu do dokumentów, korekt i wydruku.

### Co w nim jest

Na górze są główne przyciski:

- `Nowy` -> zacznij od pustego projektu;
- `Otwórz` -> otwórz wcześniej zapisany projekt;
- `Pobierz dane` -> wczytaj źródłowy Excel;
- `Zapisz` -> zapisz bieżący projekt;
- `Zapisz jako` -> zapisz projekt pod nową nazwą;
- `Wydruk` -> przejdź do wersji do druku.

Niżej są zakładki:

- `Dane` -> główna praca z danymi;
- `Ustawienia` -> ustawienia, słowniki, folder PDF, dane do wydruku;
- `Wydruk` -> gotowa forma do drukowania.

### Jak pracować w SME od zera

1. Na ekranie głównym kliknij `SME`.
2. Jeżeli chcesz nowy dokument, kliknij `Nowy`.
3. Kliknij `Pobierz dane`.
4. Wybierz plik Excel.
5. Po wczytaniu sprawdź zakładkę `Dane`.
6. Uzupełnij brakujące pola.
7. Przejdź do zakładki `Ustawienia`, jeżeli trzeba ustawić druk, folder dla PDF, urząd celny, kraj pochodzenia i resztę danych.
8. Kliknij `Zapisz`, żeby zapisać projekt.
9. Kliknij `Wydruk`, jeżeli chcesz dostać gotowy dokument.

### Jeżeli trzeba otworzyć stary projekt w SME

1. Otwórz moduł `SME`.
2. Kliknij `Otwórz`.
3. Wybierz wcześniej zapisany plik projektu.

Ważne: w `SME` projekt jest trzymany jako osobny plik. To nie jest baza, tylko zwykły plik zapisany w miejscu, które sam wybierasz.

### Jeżeli trzeba po prostu zapisać pracę

- kliknij `Zapisz`, jeżeli ten projekt był już wcześniej zapisany;
- kliknij `Zapisz jako`, jeżeli chcesz zapisać kopię pod inną nazwą albo w innym folderze.

### Jeżeli trzeba wydrukować dokument

1. Otwórz projekt w `SME`.
2. Kliknij `Wydruk`.
3. Sprawdź końcową formę.
4. Jeżeli wszystko się zgadza, kliknij `Drukuj`.

Druk idzie na drukarkę domyślną w Windows.

### Jeżeli trzeba nie tylko drukować, ale też zapisać PDF

1. Przejdź do zakładki `Ustawienia`.
2. Znajdź blok dotyczący druku i PDF.
3. Włącz opcję zapisywania PDF po wydruku.
4. Wskaż folder, do którego ma trafiać PDF.
5. Zapisz projekt.
6. Potem drukuj normalnie.

Wtedy program nie tylko wyśle dokument do drukarki, ale też zapisze PDF we wskazanym folderze.

### Co można zmieniać w zakładce Ustawienia

Znajdują się tam:

- ścieżka do pliku projektu;
- urzędy celne;
- kraje pochodzenia;
- ustawienia druku i folderu PDF;
- dane do nagłówka i podpisu w dokumencie.

Jeżeli ktoś mówi "sprawdź ustawienia przed wydrukiem", to zwykle chodzi właśnie o tę zakładkę.

## Moduł WCT CEN

### Kiedy go otwierać

Otwieraj `WCT CEN`, jeżeli pracujesz z kontenerami i potrzebujesz:

- wczytać listę z Excela;
- uzupełnić `CEN`;
- uzupełnić `T-State`;
- uzupełnić `Stop`;
- prowadzić lokalną bazę powiązań dla kontenerów.

### Co trzeba od razu zrozumieć

W tym module projekt nie jest trzymany jako osobny plik, jak w `SME`, tylko w bazie danych.

Czyli działa to tak:

- wybierasz bazę;
- pracujesz w tej bazie;
- zapisujesz projekt pod nazwą;
- potem otwierasz go ponownie po nazwie z tej samej bazy.

### Jakie są główne przyciski

Na górze są:

- `Nowy` -> nowy projekt;
- `Otwórz` -> otwarcie projektu z bazy;
- `Importuj Excel` -> wczytanie Excela;
- `Zaktualizuj` -> uzupełnienie danych po kontenerach;
- `Zapisz` -> zapis projektu do bazy;
- `Zapisz jako` -> zapis jako nowy projekt w bazie.

Są też zakładki:

- `Dane`;
- `Ustawienia`.

### Jak pracować w WCT CEN od zera

1. Otwórz `WCT CEN`.
2. Jeżeli to pierwszy raz, przejdź do zakładki `Ustawienia`.
3. Sprawdź ścieżkę do bazy.
4. Jeżeli baza ma być w innym miejscu, kliknij wybór bazy i wskaż odpowiedni plik.
5. Wróć do zakładki `Dane`.
6. Kliknij `Importuj Excel`.
7. Wybierz plik Excel.
8. Sprawdź wiersze.
9. Jeżeli trzeba, dopisz lub popraw dane ręcznie.
10. Kliknij `Zaktualizuj`, żeby program spróbował uzupełnić puste wartości po kontenerach.
11. Kliknij `Zapisz`.

### Jeżeli trzeba otworzyć zapisany projekt w WCT CEN

1. Otwórz `WCT CEN`.
2. W polu nazwy projektu zacznij wpisywać nazwę.
3. Wybierz właściwy projekt.
4. Kliknij `Otwórz`.

### Jeżeli trzeba dodać wiersz ręcznie

1. Otwórz zakładkę `Dane`.
2. Kliknij `Dodaj wiersz`.
3. Wypełnij wiersz.
4. Zapisz projekt.

### Jeżeli lookup nie znajduje potrzebnych danych

Wtedy można dodać wpis ręcznie:

1. Otwórz zakładkę `Ustawienia`.
2. W bloku ręcznych wpisów wypełnij `Container Number`.
3. Uzupełnij potrzebne pola `CEN`, `T-State`, `Stop`.
4. Kliknij `Zapisz rekord`.

Taki wpis trafi do lokalnej bazy i później będzie mógł być podstawiany do projektu.

### Jeżeli trzeba po prostu odświeżyć dane w tabeli

1. Otwórz projekt.
2. Kliknij `Zaktualizuj`.
3. Poczekaj do końca.
4. Sprawdź, czy potrzebne pola się uzupełniły.
5. Kliknij `Zapisz`.

### Gdzie znajduje się baza WCT CEN

Domyślnie najczęściej jest tutaj:

- `C:\Users\Twoja_nazwa\AppData\Roaming\SME\wct_cen_db.sqlite`

Jeżeli w trakcie pracy wskażesz inną bazę, moduł będzie używał właśnie tego pliku.

## Moduł CEN IMTREKS

### Kiedy go otwierać

Otwieraj `CEN IMTREKS`, jeżeli trzeba pracować z rejestrami `IMTREKS` i uzupełniać:

- `T1`;
- `Status`;
- `Stop`.

### Najważniejsza różnica względem WCT CEN

Ten moduł też działa na bazie, ale projekt może składać się z kilku arkuszy miesięcznych.

Czyli po imporcie możesz zobaczyć nie jedną tabelę, tylko zestaw miesięcy.

### Jakie są główne przyciski

Na górze są:

- `Nowy`;
- `Otwórz`;
- `Importuj Excel`;
- `Zaktualizuj`;
- `Zapisz`;
- `Zapisz jako`.

Są zakładki:

- `Dane`;
- `Ustawienia`.

### Jak pracować w CEN IMTREKS od zera

1. Otwórz `CEN IMTREKS`.
2. Jeżeli to pierwszy start, otwórz zakładkę `Ustawienia`.
3. Sprawdź ścieżkę do bazy.
4. Jeżeli trzeba, wybierz inną bazę.
5. Wróć do zakładki `Dane`.
6. Kliknij `Importuj Excel`.
7. Wybierz plik.
8. Po imporcie sprawdź miesiące i wiersze.
9. Jeżeli trzeba, przełączaj się między miesiącami.
10. Kliknij `Zaktualizuj`, żeby uzupełnić brakujące wartości.
11. Po sprawdzeniu kliknij `Zapisz`.

### Jeżeli trzeba otworzyć stary projekt w CEN IMTREKS

1. Otwórz `CEN IMTREKS`.
2. Zacznij wpisywać nazwę projektu.
3. Wybierz ją z listy.
4. Kliknij `Otwórz`.

### Jeżeli trzeba znaleźć kontener ręcznie

W zakładce `Dane` jest wyszukiwarka. Wpisz numer kontenera, a tabela się odfiltruje.

### Jeżeli aktualizacja trwa długo

To normalne. W tym module aktualizacja może chwilę potrwać.

W czasie aktualizacji:

- program pokazuje status;
- dane mogą uzupełniać się stopniowo;
- aktualizację można anulować.

### Jeżeli trzeba wymusić ponowne uzupełnienie danych

Obok tabeli jest przełącznik `Force`.

Używaj go tylko wtedy, kiedy naprawdę chcesz nadpisać już uzupełnione wartości.

Tryb zwykły:

- program stara się dopisywać tylko puste pola.

Tryb `Force`:

- program próbuje ponownie odświeżyć także pola już uzupełnione.

### Jeżeli lookup znowu nic nie znalazł

Tak samo jak w `WCT CEN`, można dodać wpis ręcznie:

1. Otwórz zakładkę `Ustawienia`.
2. Wpisz `Container Number`.
3. Uzupełnij `CEN`, `T-State`, `Stop`.
4. Kliknij `Zapisz rekord`.

### Gdzie znajduje się baza CEN IMTREKS

Domyślnie najczęściej jest tutaj:

- `C:\Users\Twoja_nazwa\AppData\Roaming\SME\cen_imtreks_db.sqlite`

Jeżeli wskażesz inny plik bazy, moduł będzie pracował właśnie z nim.

## Gdzie co się znajduje

### Gdzie leży sam program

Najczęściej tutaj:

- `C:\Users\Twoja_nazwa\AppData\Local\Programs\SME`

### Gdzie leżą wspólne dane programu

Najczęściej tutaj:

- `C:\Users\Twoja_nazwa\AppData\Roaming\SME`

Jeżeli ktoś mówi "wejdź do folderu z danymi programu", to zwykle chodzi właśnie o to miejsce.

### Co jest w folderze AppData\Roaming\SME

Najczęściej znajdują się tam:

- wspólna baza ustawień programu;
- baza `WCT CEN`;
- baza `CEN IMTREKS`;
- zainstalowane dodatkowe moduły.

### Gdzie są projekty SME

Projekty `SME` znajdują się tam, gdzie sam je zapiszesz.

Czyli `SME` nie ma jednego stałego folderu dla wszystkich projektów. Miejsce zapisania wybierasz sam.

### Gdzie są projekty WCT CEN i CEN IMTREKS

Są zapisane wewnątrz swoich baz danych.

Najprościej mówiąc:

- w `WCT CEN` projekt siedzi w pliku bazy `wct_cen_db.sqlite`;
- w `CEN IMTREKS` projekt siedzi w pliku bazy `cen_imtreks_db.sqlite`.

Jeżeli nie widzisz "pliku projektu", to normalne. W tych dwóch modułach projekty nie zapisują się jako osobne pliki tak jak w `SME`.

## Co klikać w typowych sytuacjach

### Jeżeli trzeba zacząć od zera

1. Otwórz potrzebny moduł.
2. Kliknij `Nowy`.
3. Zaimportuj plik albo wpisz dane ręcznie.

### Jeżeli trzeba wrócić do starej pracy

1. Otwórz potrzebny moduł.
2. Jeżeli to `SME` -> kliknij `Otwórz` i wybierz plik.
3. Jeżeli to `WCT CEN` albo `CEN IMTREKS` -> wpisz nazwę projektu i kliknij `Otwórz`.

### Jeżeli trzeba zapisać wynik

- w `SME` -> `Zapisz` albo `Zapisz jako`;
- w `WCT CEN` -> `Zapisz` albo `Zapisz jako`;
- w `CEN IMTREKS` -> `Zapisz` albo `Zapisz jako`.

Przyciski nazywają się tak samo, ale znaczenie jest inne:

- w `SME` zapisuje się osobny plik;
- w dwóch pozostałych modułach zapisuje się wpis w bazie.

### Jeżeli nie widać potrzebnego modułu na ekranie głównym

1. Kliknij `Widoczność modułów`.
2. Włącz potrzebny moduł.
3. Zapisz widok.

### Jeżeli trzeba wrócić do wyboru modułów

W modułach jest przycisk powrotu do ekranu głównego. Użyj przycisku przejścia do modułów.

## Jeżeli coś poszło nie tak

### Program nie widzi potrzebnego modułu

- sprawdź, czy moduł nie jest ukryty w ustawieniach widoczności;
- jeżeli na kafelku jest `Zainstaluj`, najpierw go zainstaluj;
- jeżeli na kafelku jest `Aktualizuj`, najpierw go zaktualizuj.

### W WCT CEN albo CEN IMTREKS nie da się znaleźć projektu

- upewnij się, że wybrana jest właściwa baza;
- sprawdź nazwę projektu;
- jeżeli wybrana była zła baza, przełącz ją i spróbuj ponownie.

### Dane nie uzupełniają się automatycznie

- sprawdź internet;
- sprawdź numer kontenera;
- jeżeli nadal nic nie znajduje, dodaj wpis ręcznie przez `Ustawienia`.

### Nie możesz znaleźć plików programu

Zwykle trzeba patrzeć w dwa miejsca:

- sam program -> `AppData\Local\Programs\SME`;
- dane robocze -> `AppData\Roaming\SME`.

## Najważniejsze w skrócie

- `SME` -> osobne pliki projektów i wydruk.
- `WCT CEN` -> projekty wewnątrz bazy `wct_cen_db.sqlite`.
- `CEN IMTREKS` -> projekty wewnątrz bazy `cen_imtreks_db.sqlite`.
- Jeżeli widzisz `Otwórz` -> otwieraj.
- Jeżeli widzisz `Zainstaluj` -> najpierw instaluj.
- Jeżeli widzisz `Aktualizuj` -> najpierw aktualizuj.
