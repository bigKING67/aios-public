"""Fit indexed semantic groups to a hard line budget without copying model text."""
def fit_boundaries(words, answer, forbidden, clause_ends=()):
    from .semantic_captions import line_units
    if not isinstance(answer,dict) or set(answer)!={'groups'} or not isinstance(answer['groups'],list) or not 1<=len(answer['groups'])<=500:
        raise ValueError('invalid boundary groups')
    cursor=0;output=[];repairs=[]
    for group in answer['groups']:
        if not isinstance(group,dict) or set(group)!={'end','lineEnds'}:
            raise ValueError('model may only select boundaries')
        end,lines=group['end'],group['lineEnds']
        if type(end) is not int or not cursor<end<=len(words) or not isinstance(lines,list) or not 1<=len(lines)<=2 or lines[-1]!=end:
            raise ValueError('invalid model boundaries')
        start=cursor;over=False
        for boundary in lines:
            if type(boundary) is not int or not start<boundary<=end or boundary in forbidden:
                raise ValueError('invalid or protected line boundary')
            text=''.join(w['text'] for w in words[start:boundary])
            over |= len(text)>18 or line_units(text)>18
            start=boundary
        complete=''.join(w['text'] for w in words[cursor:end])
        if len(lines)>1 and len(complete)<=18 and line_units(complete)<=18 and not any(cursor<b<end for b in clause_ends):
            output.append({'end':end,'lineEnds':[end]})
            repairs.append({'startWord':cursor,'endWord':end,'linesBefore':lines,'linesAfter':[end],
                            'reason':'short_clause_single_line'})
        elif not over:
            output.append(group)
        else:
            fitted=[];start=cursor
            while start<end:
                text='';valid=None
                for index in range(start,end):
                    text+=words[index]['text']
                    if len(text)>18 or line_units(text)>18:break
                    if index+1 not in forbidden:valid=index+1
                if valid is None:
                    raise ValueError('protected token exceeds line capacity')
                preferred=[b for b in lines if start<b<=valid]
                valid=max(preferred) if preferred else valid
                fitted.append(valid);start=valid
            for i in range(0,len(fitted),2):
                chunk=fitted[i:i+2];output.append({'end':chunk[-1],'lineEnds':chunk})
            repairs.append({'startWord':cursor,'endWord':end,'linesBefore':lines,'linesAfter':fitted})
        cursor=end
    if cursor!=len(words) or len(output)>500:
        raise ValueError('incomplete or excessive caption groups')
    return {'groups':output},repairs
