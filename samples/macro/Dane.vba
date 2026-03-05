Sub Makro1()
'przycisk - Oblicz
'Odkrywanie i zakrywanie wierszy w Arkuszu - Wydruk !!!!
Sheets("Wydruk").Unprotect "ala"
Application.ScreenUpdating = False

'Kontrola czy jest numer i data noty
Range("M12").Select
start1:
If ActiveCell.Value = "   EUR" Then
   GoTo dalej2
ElseIf ActiveCell.Offset(1, 0).Value = "" And ActiveCell.Offset(1, 1).Value <> "" _
   Or ActiveCell.Offset(1, 0).Value <> "" And ActiveCell.Offset(1, 1).Value = "" Then
   ActiveCell.Select
   MsgBox (" Brak daty lub numeru noty !")
   GoTo wypad1
Else
   ActiveCell.Offset(1, 0).Select
   GoTo start1
End If

dalej2:
' Uk³ad do wydruku

If Range("R16") = 1 Or Range("R16") = 2 Or Range("R16") = 4 Or Range("R16") = 5 Or Range("R16") = 6 Or Range("R16") = 10 Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A17:A80").Select
   Selection.EntireRow.Hidden = False
   ActiveSheet.Range("A50:A57").Select
   Selection.EntireRow.Hidden = True
   ActiveSheet.Range("A76:A76").Select   'z powa¿aniem Ur..
   Selection.EntireRow.Hidden = True
   GoTo dalej1
End If
If Range("R16") = 3 Then            'dla tylko 3 wpisów - linii
   Sheets("Wydruk").Select
   ActiveSheet.Range("A17:A80").Select
   Selection.EntireRow.Hidden = False
   ActiveSheet.Range("A50:A57").Select
   Selection.EntireRow.Hidden = True
   ActiveSheet.Range("A78:A80").Select
   Selection.EntireRow.Hidden = True
   GoTo dalej1
End If
If Range("R16") = 7 Then            'dla tylko 7 wpisów - linii
   Sheets("Wydruk").Select
   ActiveSheet.Range("A17:A80").Select
   Selection.EntireRow.Hidden = False
   'ActiveSheet.Range("A76:A76").Select
   'Selection.EntireRow.Hidden = True
   ActiveSheet.Range("A76:A76").Select  'z powa¿aniem Ur..
   Selection.EntireRow.Hidden = True
   GoTo dalej1
End If
If Range("R16") = 8 Then            'dla tylko 8 wpisów - linii
   Sheets("Wydruk").Select
   ActiveSheet.Range("A17:A80").Select
   Selection.EntireRow.Hidden = False
   'ActiveSheet.Range("A76:A76").Select
   'Selection.EntireRow.Hidden = True
   ActiveSheet.Range("A50:A52").Select
   Selection.EntireRow.Hidden = True
   ActiveSheet.Range("A76:A76").Select  'z powa¿aniem Ur..
   Selection.EntireRow.Hidden = True
   GoTo dalej1
End If
If Range("R16") = 9 Then            'dla tylko 9 wpisów - linii
   Sheets("Wydruk").Select
   ActiveSheet.Range("A17:A80").Select
   Selection.EntireRow.Hidden = False
   'ActiveSheet.Range("A76:A76").Select
   'Selection.EntireRow.Hidden = True
   ActiveSheet.Range("A50:A55").Select
   Selection.EntireRow.Hidden = True
   ActiveSheet.Range("A76:A76").Select  'z powa¿aniem Ur..
   Selection.EntireRow.Hidden = True
   GoTo dalej1
End If

dalej1:
Sheets("Dane").Select
If Range("M12") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A17:A19").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A17:A19").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M13") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A20:A22").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A20:A22").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M14") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A23:A25").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A23:A25").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M15") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A26:A28").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A26:A28").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M16") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A29:A31").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A29:A31").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M17") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A32:A34").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A32:A34").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M18") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A35:A37").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A35:A37").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M19") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A38:A40").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A38:A40").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M20") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A41:A43").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A41:A43").Select
   Selection.EntireRow.Hidden = True
End If
Sheets("Dane").Select
If Range("M21") <> "" Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A44:A46").Select
   Selection.EntireRow.Hidden = False
Else
   Sheets("Wydruk").Select
   ActiveSheet.Range("A44:A46").Select
   Selection.EntireRow.Hidden = True
End If

Sheets("Dane").Select
If Range("R16") = 10 Then    'dla tylko 10 wpisów - linii
   Sheets("Wydruk").Select
   ActiveSheet.Range("A74:J75").Select
   With Selection.Font
        .Size = 10
   End With
End If
If Range("R16") < 10 Then
   Sheets("Wydruk").Select
   ActiveSheet.Range("A74:J75").Select
   With Selection.Font
        .Size = 11
   End With
End If
Sheets("Wydruk").Select
ActiveSheet.Range("D3").Select
GoTo wypad1

wypad1:
Sheets("Wydruk").Protect "ala"
End Sub
Sub dane1()
    'Przycisk Pobierz dane
Sheets("Dane").Unprotect "ala"
Application.ScreenUpdating = False
Dim a1, a2, a3, x1 As String
a1 = Range("C5").Value 'lokalizacja pliku  np.: S:\Mittal\2013
'dla dysku D zmieniæ w polu C5 formu³ê na =Z£¥CZ.TEKSTY("D:\Mittal\";E2)
a2 = Range("C6").Value    'nazwa pliku np.: for1.xls
a3 = "Uwaga !!! Lokalizacja lub nazwa pliku jest nieprawid³owa !!!"
a4 = "Dane z wybranego pliku  a2  zosta³y pobrane !"

'Sprawdzenie czy istnieje podany plik w podanej lokalizacji

x1 = a1 + "\" + a2      'np.: S:\Mittal\2013\for1.xls
FileExists = (Dir(x1) <> "")
  If FileExists = False Then
     MsgBox (a3)
     GoTo koniec
  End If

'Plik o nazwie w a2 (E3) w lokalizacji a1 (E2)

'wype³nienie kolumny Nr faktury
Range("B12").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R28C3"
Range("B13").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R30C3"
Range("B14").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R32C3"
Range("B15").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R34C3"
Range("B16").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R36C3"
Range("B17").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R38C3"
Range("B18").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R40C3"
Range("B19").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R42C3"
Range("B20").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R44C3"
Range("B21").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R46C3"

'wype³nienie kolumny Waga wy¿sza w tonach
Range("C12").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R28C4"
Range("C13").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R30C4"
Range("C14").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R32C4"
Range("C15").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R34C4"
Range("C16").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R36C4"
Range("C17").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R38C4"
Range("C18").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R40C4"
Range("C19").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R42C4"
Range("C20").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R44C4"
Range("C21").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R46C4"

'wype³nienie kolumny Cena w EUR
Range("D12").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R28C5"
Range("D13").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R30C5"
Range("D14").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R32C5"
Range("D15").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R34C5"
Range("D16").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R36C5"
Range("D17").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R38C5"
Range("D18").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R40C5"
Range("D19").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R42C5"
Range("D20").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R44C5"
Range("D21").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R46C5"

'wype³nienie kolumny Wartoœæ w EUR
Range("E12").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R28C6"
Range("E13").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R30C6"
Range("E14").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R32C6"
Range("E15").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R34C6"
Range("E16").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R36C6"
Range("E17").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R38C6"
Range("E18").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R40C6"
Range("E19").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R42C6"
Range("E20").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R44C6"
Range("E21").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R46C6"

'wype³nienie pola Razem pod kolumn¹ Wartoœæ w EUR
Range("E23").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Oœwiad. wartoœci'!R49C6"

'wype³nienie pola Koszt transportu i wa¿enia wagonów
Range("E30").Select
ActiveCell.FormulaR1C1 = "=+'" + a1 + "\[" + a2 + "]Koszt transportu'!R32C7"

Range("F1").Select

'zast¹pienie po³¹czeñ z plikiem wartoœciami
Range("B12:E23").Select
    Selection.Copy
    Range("B12").Select
    Selection.PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
        :=False, Transpose:=False
    Application.CutCopyMode = False
    Range("E30").Select
    Selection.Copy
    Range("E30").Select
    Selection.PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
        :=False, Transpose:=False
    Application.CutCopyMode = False
    Range("F1").Select
    MsgBox (a4)
koniec:
Range("F1").Select
Sheets("Dane").Protect "ala"
End Sub

Private Sub uc_Change()

Sheets("Dane").Unprotect "ala"

If Sheets("Dane").Range("J6") = "MRN" Then
   Sheets("Dane").Range("I5") = "Numer MRN:"
   Sheets("Dane").Range("J5") = " 18PL"
End If
If Sheets("Dane").Range("J6") = "331030/00/" Then
   Sheets("Dane").Range("I5") = "Numer OGL:"
   Sheets("Dane").Range("J5") = "012345/2013"
End If
If Sheets("Dane").Range("J6") = "331020/00/" Then
   Sheets("Dane").Range("I5") = "Numer OGL:"
   Sheets("Dane").Range("J5") = "012345/2013"
End If
If Sheets("Dane").Range("J6") = "" Then
   Sheets("Dane").Range("I5") = "???"
   Sheets("Dane").Range("J5") = "???"
End If
Sheets("Dane").Protect "ala"
End Sub
