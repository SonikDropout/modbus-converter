# Modbus-converter

Скрипт для генерации скриптов, отправляющих комманды для ЧПУ станка по modbus

Для работы нужно установить nodejs и запустить скрипт коммандой
`node converter.js [input file] [output file]`

На данный момент скрипт может конверировать только одну комманду - G1 (линейное перемещение). Задание скорости не поддерживается. 
Команды в файле должны иметь вид `G1 X[distance] Y[distance];`
