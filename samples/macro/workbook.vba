Private Sub Workbook_BeforeClose(Cancel As Boolean)
Application.ScreenUpdating = True
ActiveWindow.DisplayWorkbookTabs = False
Sheets("Start").Visible = True
Sheets("Start").Select
If ActiveWorkbook.Name = "Trade_N.xls" Then
   Sheets("Start").Select
   GoTo pa1
End If
Sheets("Wydruk").Select
ActiveSheet.Range("I2").Select
Selection.Copy
Selection.PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
      :=False, Transpose:=False
ActiveSheet.Range("I2").Select
Application.CutCopyMode = False
Sheets("Start").Select
ActiveWorkbook.Save
pa1:
ActiveWorkbook.Close SaveChanges:=False
End Sub
Private Sub Workbook_Open()
Application.ScreenUpdating = False
Sheets("Start").Visible = False
ActiveWindow.DisplayWorkbookTabs = True
On Error GoTo ho1
If ActiveWorkbook.Name = "Trade_N.xls" Then
    Sheets("Dane").Unprotect "ala"
    Workbooks.Open Filename:="S:\Noty_Mit\Num_N.xls"
    'Workbooks.Open Filename:="D:\Noty_Mit\Num_N.xls"
    Application.Run "Num_N.xls!NUMER"
    ActiveWorkbook.Save
    Workbooks("Num_N.xls").Sheets("Arkusz1").Range("B1").Copy _
        Workbooks("Trade_N.xls").Sheets("Dane").Range("B25")
    ActiveWindow.Close
    ChDrive "S"
    'ChDrive "D"
    ChDir "S:\Noty_Mit\Kosz_N"
    'ChDir "D:\Noty_Mit\Kosz_N"
    ActiveWorkbook.SaveAs Filename:=Sheets("Dane").Range("B25").Value & "_kosz"
    Sheets("Dane").Select
    ActiveSheet.Range("B25").Select
    Selection.HorizontalAlignment = xlCenter
    Selection.Font.ColorIndex = 48
    Selection.Borders(xlEdgeLeft).LineStyle = xlContinuous
    Selection.Borders(xlEdgeBottom).LineStyle = xlContinuous
    Selection.Borders(xlEdgeRight).LineStyle = xlContinuous
    Range("F1").Select
    'ActiveWindow.DisplayWorkbookTabs = False
    Sheets("Dane").Protect "ala"
End If
Exit Sub
ho1:
MsgBox (" Brak po³¹czenia z dyskiem S. Nie mo¿na pobieraæ danych ! ")
'MsgBox (" Brak po³¹czenia z dyskiem D. Nie mo¿na pobieraæ danych ! ")
Sheets("Dane").Protect "ala"

End Sub

