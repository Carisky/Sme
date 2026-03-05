Sub zapis_d()
'Przycisk zapisz
Dim i, x1 As String
start:
    i = InputBox("Wpisz nazwê z jak¹ ma byæ zapisany ten wniosek, np.: ", "Zapis w katalogu S:/NOTY_MIT", "Korekta1")
    If i = "" Then
       GoTo et
    Else
       x1 = "S:\Noty_Mit\" + i + ".xls"
       'x1 = "D:\Noty_Mit\" + i + ".xls"
       
       FileExists = (Dir(x1) <> "")
       If FileExists = True Then
          MsgBox (" Formularz z tak¹ nazw¹ ju¿ istnieje! WprowadŸ inn¹ nazwê ! ")
          GoTo start
       Else
          ChDrive "S"
          'ChDrive "D"
          ChDir "S:\Noty_Mit"
          'ChDir "D:\Noty_Mit"
          ActiveWorkbook.SaveAs Filename:=i
          GoTo koniec
       End If
    End If

et: MsgBox (" Nieprawid³owa nazwa pliku ! Plik nie zosta³ zapisany ! ")
koniec:

End Sub
Sub powr()
'przycisk Powrót
Sheets("Dane").Select
ActiveSheet.Range("F1").Select
End Sub
